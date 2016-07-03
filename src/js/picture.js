"use strict";
/* globals $: true */

if (!global.HTMLPictureElement) {
    document.createElement('picture');
    document.createElement('source');

    if (global.addEventListener) {
        global.addEventListener('resize', function () {
            render(document.getElementsByTagName('picture'));
        }, false);
    } else {
        global.attachEvent('onresize', function () {
            render(document.getElementsByTagName('picture'));
        });
    }
}

var devicePixelRatio = global.devicePixelRatio || 1;
var screenMatrix = ['lg', 'md', 'sm', 'xs', 'default'];
var $ = null;

module.exports = {
    parse: function (node) {
        if(!node) {
            node = document.body;
        }
        node = getNativeNode(node);
        if(node.tagName.toLowerCase() === 'picture') {
            render([node]);
        } else {
            render(collectionToArray(node.getElementsByTagName('picture')));
        }
    },

    update: function(node, sources) {
        node = getNativeNode(node);
        sources.forEach(function(source) {
            node.querySelectorAll('source.' + source.type)[0].srcset = source.srcset;
        });
    },

    addjQueryTriggerSupport: function(jquery) {
        $ = jquery;
    }
};

function getNativeNode(node) {
    if (node.get) {
        return node.get(0);
    }
    return node;
}

function render(pictures) {
    var screenSize = getScreenSize();
    pictures = Array.prototype.slice.call(pictures);
    pictures.forEach(function (picture) {
        if (!global.HTMLPictureElement || picture.querySelectorAll('svg').length) {
            if (!picture.modified) {
                removeIE9VideoShim(picture);
                observePictureImage(picture);
                picture.modified = true;
            }
            showImage(picture, screenSize);
        } else {
            if (!picture.modified) {
                observePictureImage(picture);
                if(picture.image.tagName === 'IMG') {
                    if(picture.image.complete) {
                        global.animationFrame.add(function() {
                            triggerEvent(picture.image, 'load');
                        });
                    }
                }
                picture.modified = true;
            }
        }
    });
}

/*
 *  Configure and observe the image inside the picture element
 *  Following picture properties will be set:
 *  - sourceMap = map of sources which are provided by picture element
 *  - image = image element inside the picture element
 *  - image.cached = history of already loaded image sources
 */
function observePictureImage(picture) {
    picture.sources = collectSources(picture.querySelectorAll('source'));
    picture.image = picture.getElementsByTagName('img')[0] || picture.getElementsByTagName('image')[0];
    picture.image.cached = [];
    picture.image.onload = function () {
        if(picture.image.currentSrc) {
            picture.image.screenType = picture.sources[picture.image.currentSrc];
        } else {
            picture.image.screenType = picture.sources[picture.image.src || picture.image.getAttribute('xlink:href')];
        }
        if($) {
            $(picture).trigger('load');
        }
    };
}

var size = null;
function getScreenSize() {
    if(!size) {
        size = document.body.currentStyle || global.getComputedStyle(document.body, ':after');
        if(!size.getPropertyValue('content')) {
            size = global.getComputedStyle(document.body, ':after');
        }
    }
    return screenMatrix.indexOf(size.getPropertyValue('content').replace(/"/g, "").replace(/'/g, ""));
}

/*
 *  Removes the IE9 video shim (conditional comment)
 */
function removeIE9VideoShim(picture) {
    var videos = collectionToArray(picture.getElementsByTagName('video'));
    videos.forEach(function(video) {
        var vsources = video.getElementsByTagName('source');
        while (vsources.length) {
            picture.insertBefore(vsources[ 0 ], video);
        }
        video.parentNode.removeChild(video);
    });
}

function showImage(picture, screenSize) {
    if(picture.image === undefined) {
        picture.image = picture.querySelectorAll('img')[0];
        picture.image.cached = [];
    }
//        console.log(picture.querySelectorAll('img')[0].type);
    
    if(picture.image.type === undefined || picture.image.type !== screenMatrix[screenSize]) {

        var sources = collectionToArray(picture.querySelectorAll('source.' + screenMatrix[screenSize]));
        if(sources.length) {
            sources.forEach(function(source) {
                loadImage(picture, source);
            });
        } else {
            if(screenSize < 4) {
                showImage(picture, ++screenSize);
            } else {
                throw 'no sources defined';
            }
        }
    }
}

function loadImage(picture, source) {

    global.animationFrame.add(function() {
        setSource(picture, source);
    });
    picture.image.type = source.className;
}

function setSource(picture, source) {
    registerSource(picture, source.className);
    var srcset = source.getAttribute('srcset');
    if(srcset) {
        if(picture.image.src) {
            preloadImage(srcset, function(img) {
                picture.image.src = img.src;
            });
        } else {
            preloadImage(srcset, function(img) {
                picture.image.setAttribute('xlink:href', img.src);
                picture.image.setAttribute('width', img.width);
                picture.image.setAttribute('height', img.height);
                picture.image.parentNode.setAttribute('viewBox', '0 0 ' + img.width + ' ' + img.height);
                picture.image.parentNode.setAttribute('width', img.width);
                picture.image.parentNode.setAttribute('height', img.height);
                picture.style.paddingTop = (img.height / img.width) * 100 + '%';
            });
        }
    } else {
        picture.image.src = source.src;
    }
}

function registerSource(picture, className) {
    picture.image.cached.push(className);
}

function collectSources(sources) {
    var map = {};
    collectionToArray(sources).forEach(function(source) {
        map[getSrcFromSrcSet(source.getAttribute('srcset'))] = source.className;
    });
    return map;
}

function getSrcFromSrcSet(srcset) {
    var candidates = getCandidates(srcset);
    return getBestCandidate(candidates).url;
}

function getCandidates(srcset) {
    var candidates = srcset.split( /\s*,\s*/ );
    var formattedCandidates = [];

    for ( var i = 0, len = candidates.length; i < len; i++ ) {
        var candidate = candidates[ i ];
        var candidateArr = candidate.split( /\s+/ );
        var sizeDescriptor = candidateArr[ 1 ];
        var resolution;
        if ( sizeDescriptor && ( sizeDescriptor.slice( -1 ) === "w" || sizeDescriptor.slice( -1 ) === "x" ) ) {
            sizeDescriptor = sizeDescriptor.slice( 0, -1 );
        }

        resolution = sizeDescriptor ? parseFloat( sizeDescriptor, 10 ) : 1;

        var formattedCandidate = {
            url: candidateArr[ 0 ],
            resolution: resolution
        };
        formattedCandidates.push( formattedCandidate );
    }
    return formattedCandidates;
}

function getBestCandidate(candidates) {
    candidates.sort(function( a, b ) {
        return b.resolution - a.resolution;
    });
    var candidate, bestCandidate = candidates[0];
    for ( var l=1; l < candidates.length; l++ ) {
        candidate = candidates[ l ];
        if ( candidate.resolution >= Math.round(devicePixelRatio) && candidate.resolution <= bestCandidate.resolution) {
            bestCandidate = candidate;
        } else {
            break;
        }
    }
    return bestCandidate;
}

function triggerEvent(el, eventName) {
    if (document.createEvent) {
        var event = document.createEvent('HTMLEvents');
        event.initEvent(eventName, true, false);
        el.dispatchEvent(event);
    } else {
        el.fireEvent('on' + eventName);
    }
}

function collectionToArray(collection) {
    for(var i = 0, list = []; i < collection.length; i++) {
        list.push(collection[i]);
    }
    return list;
}

function preloadImage(srcset, callback) {
    var img = new Image();
    img.onload = function() {
        callback(img);
    };
    img.src = getSrcFromSrcSet(srcset);
}
