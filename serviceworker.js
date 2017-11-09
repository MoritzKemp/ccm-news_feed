/* 
 * The MIT License
 *
 * Copyright 2017 Moritz Kemp <moritz at kemp-thelen.de>.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/* global self, indexedDB, fetch, caches, Promise */


/* --- IndexedDB configs */
const DB_NAME = "newsFeed";
const DB_VERSION = "2";
const SEND_POST_STORE = "send-post-requests";
const GET_POSTS_STORE = "get-posts-requests";
let idb;
/* --- Message tags --- */
const MSG_FROM_PAGE_GET_POSTS = "get-posts";
const MSG_FROM_PAGE_SEND_POST = "send-post";
const MSG_TO_PAGE_GOT_POSTS = "got-posts";
const MSG_TO_PAGE_POSTS_SENT = "posts-sent";
const SYNC_SEND_POSTS = "send-posts";
const SYNC_GET_POSTS = "get-posts";
/* --- Cache config --- */
const CACHE_NAME = "ccm-news-feed-v3";
const cache_urls = {
    "https://akless.github.io/ccm/ccm.js"   : "cacheFailNetwork",
    "https://MoritzKemp.github.io/ccm-news_feed/"                                    : "networkFailCache",
    "https://MoritzKemp.github.io/ccm-news_feed/ccm.news_feed.js"                    : "networkFailCache",
    "https://MoritzKemp.github.io/ccm-news_feed/style.css"                           : "cacheFailNetwork"
};

self.addEventListener('fetch', event =>{
   let requestURL = new URL( event.request.url );
    
    switch( cache_urls[requestURL.href] ){
        case "cacheOnly":
            event.respondWith(
                caches.match(event.request)
            );
            break;
        case "networkOnly":
            event.respondWith(
                fetch(event.request)
            );
            break;
        case "cacheFailNetwork":
            event.respondWith(
                caches.match(event.request).then( (cacheResponse) =>{
                   return cacheResponse || fetch(event.request); 
                })
            );
            break;
        case "networkFailCache":
            event.respondWith(
                fetch(event.request).catch( () =>{
                   return caches.match(event.request);
                })
            );
            break;
        default:
            event.respondWith( 
                fetch(event.request)
            );
    }
});

self.addEventListener('install', event =>{
    event.waitUntil(
        caches.open(CACHE_NAME).then( (cache)=>{
           for(let entry in cache_urls){
               cache.add(entry);
           }
       })
    );
});

self.addEventListener('activate', event =>{
    event.waitUntil(
        Promise.all([
            caches.keys()
            .then( (cacheNames) =>{
                return Promise.all(
                    cacheNames.map( (cacheName) =>{
                        if(CACHE_NAME !== cacheName && cacheName.startsWith("ccm-news-feed-"))
                            return caches.delete(cacheName);
                    })
                );
            }),
            openDatabase("newsFeed", "2")
        ])
    );
});

self.addEventListener('sync', event =>{
    if(event.tag === SYNC_SEND_POSTS){
        event.waitUntil(
            objectStore(idb, SEND_POST_STORE, 'readwrite')
            .then( (objectStore) =>{
                return getAllObjects(objectStore);
            })
            .then( (allObjects)=>{
                return Promise.all( allObjects.map( (object) =>{
                    return fetch( object.url )
                    .then(function( networkResponse ){
                        if( networkResponse.ok)
                            return deleteObject(object.id, SEND_POST_STORE);
                        else
                            reject(new Error("Could not send post with id: "+object.id));
                    });
                }));
            })
            .then( ()=>{
                notifyPagesPostsSent();
            })
        );
    }
    if(event.tag === SYNC_GET_POSTS){
        event.waitUntil(
            objectStore(idb, GET_POSTS_STORE, "readwrite")
            .then( (objectStore) =>{
                return getAllObjects(objectStore);
            })
            .then( (allObjects)=>{
                return Promise.all( allObjects.map( (object) =>{
                    return fetch(object.url)
                    .then( (response) =>{
                        if( response.ok){
                            deleteObject(object.id, GET_POSTS_STORE);
                            return response.json();
                        }
                        else
                            reject(new Error("Could not perform get-posts-request with id:"+object.id));
                    })
                    .then( (posts) =>{
                        notifyPagesGotPosts(posts);
                    });
                }));
            })
        );
    }
});

self.addEventListener('message', event =>{
    console.log("[SW-News-Feed] Message: ", event);
    switch(event.data.tag){
        case MSG_FROM_PAGE_SEND_POST:
            sendNewPost(event.data.url);
            break;
        case MSG_FROM_PAGE_GET_POSTS:
            getPosts(event.data.url);
            break;
        default:
            console.log("No handler in sw for event:", event);
    }
});

// Sends a new post object to a remote store
// If offline, stores post object and registers back-sync
const sendNewPost = (url) =>{
    // 1. Try to send post object to remote store
    fetch(url)
    .then( (response) =>{
    // 2. If successfull, send message to client
        notifyPagesPostsSent();
    })
    .catch( () =>{
    // 3. If offline, store in IndexedDB
        objectStore(idb, SEND_POST_STORE, "readwrite")
        .then((objectStore)=>{
            addObject( 
                objectStore,
                {
                    "url":  url,
                    "id":   Math.floor((Math.random()*1000)+1)
                }
            );
        })
        .then(()=>{
           // 4. Register back-sync
            self.registration.sync.register(SYNC_SEND_POSTS);
        })
        .catch((error)=>{
            console.log("Error: ", error);
        });
    });
};

// Gets all posts from remote store
// If offline, stores request and registers back-sync
const getPosts = (url) =>{
    // 1. Try to send post object to remote store
    fetch(url)
    .then( (response) =>{
        return response.json();
    })
    .then( (posts) =>{
        // 2. If successfull, send message with data to client
        notifyPagesGotPosts(posts);
    })
    .catch( ()=>{
        // 3. If offline, store in IndexedDB
        objectStore(idb, GET_POSTS_STORE, "readwrite")
        .then((objectStore)=>{
            addObject( 
                objectStore,
                {
                    "url":  url,
                    "id":   Math.floor((Math.random()*1000)+1)
                }
            );
        })
        .then(()=>{
           // 4. Register back-sync
            self.registration.sync.register(SYNC_GET_POSTS);
        })
        .catch((error)=>{
            console.log("Error: ", error);
        });
    });
};

const notifyPagesPostsSent = () =>{
    self.clients.matchAll({includeUncontrolled: true}).then(function( clients ){ 
        clients.forEach(function( client ){
            client.postMessage(
                {
                    "tag": MSG_TO_PAGE_POSTS_SENT
                }
            );
        });
    });
};

const notifyPagesGotPosts = (posts) =>{
    self.clients.matchAll({includeUncontrolled: true}).then(function( clients ){ 
        clients.forEach(function( client ){
            client.postMessage(
                {
                    "tag": MSG_TO_PAGE_GOT_POSTS,
                    "posts": posts
                }
            );
        });
    });
};


/* --- Database functions */
/* Inspired from "Building Progressive Web Apps", Tal Ater */

const openDatabase = function(dbName, dbVersion){
    return new Promise(( resolve, reject )=>{
        const request = self.indexedDB.open(dbName, dbVersion);
        request.onerror = function( event ){
            reject("Database error: " + event.target.error);
        };
        request.onupgradeneeded = function( event ){
            let db = event.target.result;
            db.createObjectStore(GET_POSTS_STORE, {keyPath: "id", autoIncrement: true});
            db.createObjectStore(SEND_POST_STORE, {keyPath: "id", autoIncrement: true});
            idb = db;
        };
        request.onsuccess = function( event ){
            idb = event.target.result;
            resolve( event.target.result);
        };
    });
};

const objectStore = function( db, storeName, transactionMode ){
    return new Promise((resolve, reject )=>{
        let objectStore = {};
        if(!idb){
            openDatabase(DB_NAME, DB_VERSION).then(()=>{
                objectStore = db
                    .transaction(storeName, transactionMode)
                    .objectStore(storeName);
            });
        } else {
            objectStore = db
                .transaction(storeName, transactionMode)
                .objectStore(storeName);
        }
        resolve(objectStore);
    });
};

const addObject = function( objectStore, object ){
    return new Promise(( resolve, reject)=>{
        const request = objectStore.add(object);
        request.onsuccess = resolve;
    });
};

const getAllObjects = function( objectStore ){
    return new Promise( function(resolve, reject){
        let request = objectStore.getAll();
        request.onsuccess = function( event ){
            resolve(event.target.result);
        };
        request.onerror = function( ){
            reject("Could not get all posts: "+request.error);
        };
    });
};

const deleteObject = function( key, objectStoreName ){
    return new Promise( (resolve, reject)=>{
        objectStore(idb, objectStoreName, "readwrite").then(function( objectStore ){
            objectStore.delete(key).onsuccess = function( event ){
                console.log("Delete successfull:", key);
                resolve("Successfull delete key: "+ key);
            };
        });
    });
};

