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

(function(){
    var component = {
        name: 'news_feed',
        ccm: 'https://akless.github.io/ccm/version/ccm-11.2.0.min.js',
        config: {
            "css" : ["ccm.load", "https://MoritzKemp.github.io/ccm-news_feed/style.css"],
            "storeConfig":  {
                    "store":"moritz_kemp_news_feed",
                    "url":"https://ccm.inf.h-brs.de"
            },
            "store": '',
            "user" : {},
            "enableOffline" : "false",
            "html" : {
                "inputArea" : {
                    "tag"   : "div",
                    "class" : "new-post-container",
                    "inner" : [
                        {
                            "tag"   : "form",
                            "class" : "new-post-form",
                            "onsubmit": "%action%",
                            "inner" : [
                                {
                                    "tag" : "div",
                                    "class": "new-post-input",
                                    "inner":[
                                        {
                                            "tag" : "input",
                                            "class": "new-post-title",
                                            "type" : "text",
                                            "placeholder": "Title goes here ..."
                                        },
                                        {
                                            "tag"   : "textarea",
                                            "class" : "new-post-text",
                                            "rows"  : "3",
                                            "placeholder":"Something really important ...   "
                                        }
                                    ]
                                },
                                {
                                    "tag"   : "input",
                                    "class" : "new-post-submit",
                                    "type"  : "submit",
                                    "disabled": "true"
                                }
                            ]
                        }
                    ]
                },
                "postsArea":{
                    "tag" : "div",
                    "class" : "posts-area"
                },
                "post": {
                    "tag": "div",
                    "class": "post",
                    "inner": [
                      {
                        "tag": "div",
                        "class": "head",
                        "inner": [
                           {
                            "tag": "div",
                            "class": "user",
                            "inner": [
                              {
                                "tag": "div",
                                "class": "name",
                                "inner": "%user%"
                              }
                            ]
                          },
                           {
                            "tag": "div",
                            "class": "title",
                            "inner": [
                              
                              {
                                "tag": "div",
                                "inner": "%title%"
                              },
                              {
                                "tag": "div",
                                "class": "date",
                                "inner": "%date%"
                              }
                            ]
                          },
                          {
                            "tag": "div",
                            "class":"status-indicator",
                            "inner":[
                                {
                                    "tag" : "div",
                                    "class": "%status%"
                                }
                            ]
                          }
                        ]
                      },
                      {
                        "tag": "div",
                        "class": "content",
                        "inner": {
                          "tag": "div",
                          "inner": "%text%"
                        }
                      }
                    ]
                  }
            }
        },
        Instance: function(){
            const self = this;
            let my = {};
            
            this.ready = function( callback ){
                my = self.ccm.helper.privatize(self);
                my.user.addObserver('newsfeed', toggleSendButtonState);
                if("serviceWorker" in navigator && my.enableOffline === 'true'){
                    navigator.serviceWorker.register("https://MoritzKemp.github.io/ccm-news_feed/serviceworker.js");
                    navigator.serviceWorker.addEventListener("message", handleMessageFromServiceWorker);
                }
                my.store = self.ccm.store(my.storeConfig);
                if(callback) callback();
            };
            
            this.start = function( callback ){
                renderInputArea();
                my.store.get( renderPosts );
                if(navigator.serviceWorker.controller){
                    navigator.serviceWorker.controller.postMessage({
                        "tag":"waiting-posts"
                    });
                }
                if(callback) callback();
            };
            
            /* --- Private render functions ---*/
            
            const renderInputArea = function(){
                let inputHtml = self.ccm.helper.html( 
                    my.html.inputArea,
                    {
                        action: onPostSend
                    }
                );
                self.element.appendChild( inputHtml );
            };
            
            const renderPosts = function( postsData ){
                let oldPostArea = self.element.querySelector('.posts-area');
                let newPostArea = self.ccm.helper.html( my.html.postsArea );
                if(oldPostArea)
                    self.element.replaceChild( newPostArea, oldPostArea );
                else
                    self.element.appendChild( newPostArea );
                postsData.forEach( renderSinglePost );
            };
            
            const renderSinglePost = function( singlePostData, status='' ) {
                let postsArea = self.element.querySelector('.posts-area');
                let newPostElem = self.ccm.helper.html( 
                        my.html.post, 
                        {
                            title:   singlePostData.title,
                            date:    singlePostData.date,
                            user:    singlePostData.user,
                            text:    singlePostData.text,
                            status:  status
                        } 
                    );
                if(postsArea.firstChild){
                    postsArea.insertBefore( 
                        newPostElem,
                        postsArea.childNodes[0] 
                    );
                } else {
                    postsArea.appendChild(newPostElem);
                }
                
            };
            
            const renderWaitingPosts = function( waitingPostUrls ){
                waitingPostUrls.forEach( (urlString) =>{
                    console.log(urlString);
                    let url = new URL(urlString);
                    let postData = {};
                    for(let pair of url.searchParams.entries()){
                        postData[pair[0]] = pair[1];
                    }
                    renderSinglePost( postData, 'waiting' );
                });
            };
            
            /* --- Private functions to send a new post ---*/
            
            const onPostSend = function( event ){
                event.preventDefault();
                const newPostTextElem = self.element.querySelector('.new-post-text');
                const newPostTitleElem = self.element.querySelector('.new-post-title');
                const newText  = newPostTextElem.value;
                const newTitle = newPostTitleElem.value;
                newPostTextElem.value = '';
                newPostTitleElem.value = '';
                const newPost = {
                    "title":    newTitle,
                    "text":     newText,
                    "date":     getDateTime(),
                    "user":     my.user.data().name || ''
                };
                if(my.enableOffline === 'true' && navigator.serviceWorker.controller){
                    renderSinglePost( newPost, 'waiting');
                    sendPostViaServiceWorker( newPost );
                }
                else {
                    renderSinglePost( newPost );
                    my.store.set( newPost );
                }
            };
            
            const getDateTime = function() {
                let today = new Date();
                let dd    = today.getDate();
                let mm    = today.getMonth();
                let yyyy  = today.getFullYear();
                let hour  = today.getHours();
                let min   = today.getMinutes();
                let monat = ["Januar", "Februar", "März", "April", "Mai", "Juni","Juli", "August", "September", "Oktober", "November", "Dezember"];
                if ( dd < 10 ) dd = '0' + dd;
                if ( hour < 10 ) hour = '0' + hour;
                if ( min  < 10 ) min  = '0' + min;
                return dd + ' ' + monat[ mm ].substring( 0, 3 ) + '. '  + yyyy + ' ' + hour + ':' + min;
            };
            
            const sendPostViaServiceWorker = function( newPost ){
                let completeURL = '';
                let searchParams = new URLSearchParams();
                searchParams.append("store", my.storeConfig.store);
                searchParams.append("dataset[title]", newPost.title);
                searchParams.append("dataset[text]", newPost.text);
                searchParams.append("dataset[date]", newPost.date);
                searchParams.append("dataset[user]", newPost.user);
                searchParams.append("dataset[key]", Math.floor((Math.random()*1000)+1));
                completeURL = my.storeConfig.url+"?"+searchParams.toString();
                console.log("Site controlled by: ", navigator.serviceWorker.controller);
                navigator.serviceWorker.controller.postMessage( {
                    "request"   : completeURL,
                    "tag"       : "new-post"
                });
            };
            
            /* --- Private event handlers --- */
            
            const toggleSendButtonState = function( isLoggedIn ){
                self.element.querySelector('.new-post-submit')
                .disabled = !isLoggedIn;
            };
            
            const allPostsShipped = function(){
                my.store.get( renderPosts );
            };
            
            const handleMessageFromServiceWorker = function( event ){
                switch( event.data.tag ){
                    case "posts-shipped":
                        allPostsShipped();
                        break;
                    case "waiting-posts":
                        renderWaitingPosts( event.data.waitingPosts );
                        break;
                    default:
                        console.log("No handler for sw-msg with tag: ", event.data.tag);
                }
            };
        }
    };
    
    //The following code gets the framework and registers component from above
    function p(){window.ccm[v].component(component);}
    var f="ccm."+component.name+(component.version?"-"+component.version.join("."):"")+".js";if(window.ccm&&null===window.ccm.files[f])window.ccm.files[f]=component;else{var n=window.ccm&&window.ccm.components[component.name];n&&n.ccm&&(component.ccm=n.ccm),"string"==typeof component.ccm&&(component.ccm={url:component.ccm});var v=component.ccm.url.split("/").pop().split("-");if(v.length>1?(v=v[1].split("."),v.pop(),"min"===v[v.length-1]&&v.pop(),v=v.join(".")):v="latest",window.ccm&&window.ccm[v])p();else{var e=document.createElement("script");document.head.appendChild(e),component.ccm.integrity&&e.setAttribute("integrity",component.ccm.integrity),component.ccm.crossorigin&&e.setAttribute("crossorigin",component.ccm.crossorigin),e.onload=function(){p(),document.head.removeChild(e)},e.src=component.ccm.url}} 
}());


