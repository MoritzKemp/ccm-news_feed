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

/* global self, indexedDB, fetch, caches */

const CACHE_NAME = "ccm-news-feed-v1";
const cache_urls = {
    "https://MoritzKemp.github.io/ccm-news_feed/ccm.news_feed.js"    : "cacheFailNetwork",
    "https://MoritzKemp.github.io/ccm-news_feed/style.css"           : "cacheFailNetwork" 
};

let idb;

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
                caches.match(event.request).then(function( cacheResponse ){
                   return cacheResponse || fetch(event.request); 
                })
            );
            break;
        case "networkFailCache":
            event.respondWith(
                fetch(event.request).catch(function( ){
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
        caches.open(CACHE_NAME).then(( cache )=>{
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

// 3. Background-sync tries repeatly to send and ...
self.addEventListener('sync', event =>{
    if( event.tag === "new-post"){
        event.waitUntil(
            objectStore(idb, "waiting-posts", 'readwrite')
            .then( (objectStore) =>{
                return getAllObjects(objectStore);
            })
            .then( (allObjects)=>{
                return Promise.all(allObjects.map( (object) =>{
                    return fetch( object.url )
                    .then(function( networkResponse ){
                        if( networkResponse.ok)
                            return deleteObject(object.id);
                        else
                            reject(new Error("Could not send post with id: "+object.id));
                    });
                }));
            })
            .then( ()=>{
                notifyPages();
            })
        );
    }
});

self.addEventListener('message', event =>{
    switch(event.data.tag){
        case "new-post":
            handleNewPost(event.data.request);
            break;
        case "waiting-posts":
            sendWaitingPostsToRequester(event.source);
            break;
        default:
            console.log("No handler in sw for event:", event);
    }
});

const notifyPages = function(){
    self.clients.matchAll({includeUncontrolled: true}).then(function( clients ){ 
        clients.forEach(function( client ){
            client.postMessage(
                {tag: "posts-shipped"}
            );
        });
    });
};

const sendWaitingPostsToRequester = function(client){ 
    objectStore(idb, "waiting-posts", "readwrite")
    .then( (objectStore) =>{
        return getAllObjects(objectStore);
    })
    .then( (allUrls) =>{
        let urls = [];
        allUrls.forEach( (storedUrl) =>{
            urls.push(storedUrl.url);
        });
        
        client.postMessage({
            "tag":"waiting-posts",
            "waitingPosts": urls
        });
    });
};

const handleNewPost = function(url){
    return fetch(url)
    .then(( networkResponse )=>{
        notifyPages();
    })
    .catch( ()=>{
        // If it fails, store in indexedDB ...
        objectStore(idb, "waiting-posts", "readwrite")
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
            // ... and register background-sync
            self.registration.sync.register('new-post');
        })
        .catch((error)=>{
            console.log("Error: ", error);
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
            db.createObjectStore('waiting-posts', {keyPath: "id", autoIncrement: true});
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
        const objectStore = db
            .transaction(storeName, transactionMode)
            .objectStore(storeName);
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

const deleteObject = function( key ){
    return new Promise( (resolve, reject)=>{
        objectStore(idb, "waiting-posts", "readwrite").then(function( objectStore ){
            objectStore.delete(key).onsuccess = function( event ){
                console.log("Delete successfull:", key);
                resolve("Successfull delete key: "+ key);
            };
        });
    });
};

