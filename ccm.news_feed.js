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
            },
            "css" : ["ccm.load", "./style.css"],
            "newsStore":  ["ccm.store", {
                    "store":"moritz_kemp_news_feed",
                    "url":"https://ccm.inf.h-brs.de"
            }],
            "user" : {},
            "offlineMode" : "false"
        },
        Instance: function(){
            const self = this;
            let my = {};
            
            this.ready = function( callback ){
                my = self.ccm.helper.privatize(self);
                my.user.addObserver('newsfeed', toggleSendButtonState);
                if(callback) callback();
            };
            
            this.start = function( callback ){
                my.newsStore.get( render );
                if(callback) callback();
            };
            
            /* --- Private render functions ---*/
            
            const render = function( dataset ){
                renderInputArea();
                renderPostArea();
                renderPosts( dataset );
            };
            
            const renderInputArea = function(){
                let inputHtml = self.ccm.helper.html( 
                    my.html.inputArea,
                    {
                        action: onPostSend
                    }
                );
                self.element.appendChild( inputHtml );
            };
            
            const renderPostArea = function(){
              let postsArea = self.ccm.helper.html( my.html.postsArea );
              self.element.appendChild( postsArea );
            };
            
            const renderPosts = function( postsData ){
                postsData.forEach( renderSinglePost );
            };
            
            const renderSinglePost = function( singlePostData ) {
                let postsArea = self.element.querySelector('.posts-area');
                postsArea.insertBefore( getPostHtml( singlePostData ), postsArea.childNodes[0] );
            };
            
            const getPostHtml = function( postData ){
                return self.ccm.helper.html( my.html.post, {
                  title:   postData.title,
                  date:    postData.date,
                  user:    postData.user,
                  text:    postData.text  
                  
                } );
            };
            
            /* --- Private button handlers ---*/
            
            const onPostSend = function( event ){
                event.preventDefault();
                newPostTextElem = self.element.querySelector('.new-post-text');
                newPostTitleElem = self.element.querySelector('.new-post-title');
                const newText  = newPostTextElem.value;
                const newTitle = newPostTitleElem.value;
                newPostTextElem.value = '';
                newPostTitleElem.value = '';
                const newPost = {
                    "title":    newTitle,
                    "text":     newText,
                    "date":     getDateTime(),
                    "user":     my.user.data().user || ''
                };
                my.newsStore.set( newPost );
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
            
            /* --- Private event handlers --- */
            
            const toggleSendButtonState = function( isLoggedIn ){
                self.element.querySelector('.new-post-submit')
                .disabled = !isLoggedIn;
            };
        }
    };
    
    //The following code gets the framework and registers component from above
    function p(){window.ccm[v].component(component);}
    var f="ccm."+component.name+(component.version?"-"+component.version.join("."):"")+".js";if(window.ccm&&null===window.ccm.files[f])window.ccm.files[f]=component;else{var n=window.ccm&&window.ccm.components[component.name];n&&n.ccm&&(component.ccm=n.ccm),"string"==typeof component.ccm&&(component.ccm={url:component.ccm});var v=component.ccm.url.split("/").pop().split("-");if(v.length>1?(v=v[1].split("."),v.pop(),"min"===v[v.length-1]&&v.pop(),v=v.join(".")):v="latest",window.ccm&&window.ccm[v])p();else{var e=document.createElement("script");document.head.appendChild(e),component.ccm.integrity&&e.setAttribute("integrity",component.ccm.integrity),component.ccm.crossorigin&&e.setAttribute("crossorigin",component.ccm.crossorigin),e.onload=function(){p(),document.head.removeChild(e)},e.src=component.ccm.url}} 
}());


