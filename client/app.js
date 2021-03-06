
window.rdw = (function(app, $, AudioContext) {
    'use strict';
    
    var uidKey = 'random-draw-uid',
        uid = null,
        socket = io(),
        sounds = {},
        maybeTime = 2000,
        size = 30,
        bounds = {
            top: 0,
            left: 0,
            right: window.innerWidth,
            bottom: window.innerHeight
        },
        speed = 5,
        maxSpeed = 50,
        moveHandle = null,
        entrants = {},
        ui = {
            body: $('body'),
            msg: $('.messages'),
            uid: $('.uid'),
            drawBtn: $('.draw'),
            entrants: $('.entrants'),
            form: $('form')
        };
    
    checkBrowser();
    
    socket.on('connect', initConnect);
    socket.on('userinfo', updateUser);
    socket.on('problem', addMessage);
    
    function initConnect() {
        uid = localStorage.getItem(uidKey);
        
        if (uid) {
            socket.emit('update', uid);
        } else {
            socket.emit('newuser');
        }
    }
    
    function updateUser(newUid) {
        uid = newUid;
        localStorage.setItem(uidKey, newUid);
        console.info('Socket ' + socket.id + ' is connected to the server as ' + newUid);
    }
    
    function initSetup() {
        ui.form.on('submit', function(e) {
            e.preventDefault();
            socket.emit('create', {
                uid: uid,
                name: $('[name="name"]').val(),
                path: $('[name="path"]').val(),
                item: $('[name="item"]').val(),
                urlBase: $('[name="urlBase"]').val()
            });
            return false;
        });
        
        socket.on('create', function(contest) {
            console.info('Contest created at /' + contest.path);
            addMessage('Your drawing was created!', 'success');
            ui.form.remove();
            $('.navToDraw')
                .css('display', 'block')
                .find('a')
                    .attr('href', '/' + contest.path + '/draw');
        });
    }
    
    function initJoin() {
        downloadAudio('cheer.wav');
        downloadAudio('ting.mp3');
        
        if (uid) {
            console.log('joining with uid');
            doJoin();
        } else {
            console.log('waiting for uid');
            socket.on('userinfo', doJoin);
        }
        
        socket.on('entered', function(data) {
            addMessage('You are entered...', 'info');
            ui.body.addClass('entered');
            playAudio('ting.mp3');
            
            ui.uid.text(uid);
            if (data.name) {
                $('.drawing-name').text(data.name);
            }
            if (data.item) {
                $('.drawing-item').text('drawing for a ' + data.item);
            }
            
            console.info('Entered in contest', data);
        });
        
        socket.on('maybe', function() {
            ui.body.addClass('maybe');
            setTimeout(function() {
                ui.body.removeClass('maybe');
            }, maybeTime);
        });
        
        socket.on('win', function() {
            addMessage('YOU WON!', 'success');
            ui.body.addClass('winner');
            playAudio('cheer.wav');
            vibrate();
        });
    }
    
    function doJoin() {
        console.log('joining as', uid);
        socket.emit('enterdrawing', {
            uid: uid,
            path: document.location.pathname
        });
    }
    
    function initDraw() {
        var contest = null,
            entryUrl = document.location.href.replace(/\/draw\/?$/, ''),
            contestPath = document.location.pathname
                .replace(/\/draw\/?$/, '')
                .replace(/^\//, '');
        
        socket.on('userinfo', function() {
            socket.emit('isadmin', {
                uid: uid,
                path: contestPath
            });
            
            socket.once('isadmin', function(data) {
                if (data.isAdmin) {
                    
                    ui.drawBtn.css('display', 'inline-block');
                    contest = data.contest;
                    entryUrl = (contest && contest.joinUrl) || entryUrl;
                    
                    $('.entry-url')
                        .attr('href', entryUrl)
                        .text(entryUrl);
                    
                } else {
                    addMessage('You\'re not an admin, so this page is pretty useless.');
                }
            });
        });
        
        ui.drawBtn.on('click', function(e) {
            e.preventDefault();
            socket.emit('draw', {
                uid: uid,
                path: contestPath
            });
        });
        
        socket.on('maybe', function(uid) {
            entrants[uid].addClass('maybe');
            setTimeout(function() {
                entrants[uid].removeClass('maybe');
            }, maybeTime);
        });
        
        socket.on('entry', addEntrantUI);
        socket.on('remove', removeEntrantUI);
        
        socket.on('winner', function(uid) {
            entrants[uid]
                .addClass('winner')
                .css('top', (bounds.bottom / 2) - (size / 2))
                .css('left', (bounds.right / 2) - (size / 2));
            stopMotion();
            ui.uid
                .addClass('selected')
                .text(uid);
        });
        
        $('[href="#reset"]').on('click', function(e) {
            e.preventDefault();
            socket.emit('reset', {
                uid: uid,
                path: contestPath
            });
        });
        
        $('[href="#delete"]').on('click', function(e) {
            e.preventDefault();
            socket.emit('delete', {
                uid: uid,
                path: contestPath
            });
        });
        
        socket.on('reset', function() {
            var keys = Object.keys(entrants);
            keys.forEach(function(uid) {
                removeEntrantUI(uid);
            });
        });
        
        socket.on('deleted', function() {
            document.location.replace('/setup');
        });
        
        moveAllEntrants();
    }
    
    function addEntrantUI(uid) {
        var entrant;
        
        if (uid.splice) {
            return uid.forEach(function(value) {
                addEntrantUI(value);
            });
        }
        
        entrant = $('[data-uid="' + uid + '"]');
        
        if (!entrant.length) {
            entrants[uid] = $('<figure class="entrant" data-uid="' + uid + '" title="' + uid + '"></figure>');
            ui.entrants.append(entrants[uid]);
            setStartPosition(entrants[uid]);
            startMotion(entrants[uid]);
        }
    }
    
    function setStartPosition(element) {
        var x = Math.floor(Math.random() * bounds.right),
            y = Math.floor(Math.random() * bounds.bottom);
        
        element.css('top', y + 'px');
        element.css('left', x + 'px');
    }
    
    function startMotion(element) {
        if (speed) {
            speed = Math.min(maxSpeed, speed + 1);
        }
        getNewDirection(element);
    }
    
    function stopMotion() {
        clearTimeout(moveHandle);
        moveHandle = null;
    }
    
    function getNewDirection(element) {
        element.direction = Math.floor(Math.random() * 360);
    }
    
    function moveAllEntrants() {
        var keys = Object.keys(entrants);
        keys.forEach(function(uid) {
            moveEntrant(entrants[uid]);
        });
        
        moveHandle = setTimeout(moveAllEntrants, 50);
    }
    
    function moveEntrant(element) {
        if (element) {
            var top = parseInt($(element).css('top'), 10),
                left = parseInt($(element).css('left'), 10),
                newTop = top + (speed * Math.sin(element.direction)),
                newLeft = left + (speed * Math.cos(element.direction));
            
            if (newTop < bounds.top || (newTop + size) > bounds.bottom || newLeft < bounds.left || (newLeft + size) > bounds.right) {
                getNewDirection(element);
                return moveEntrant(element);
            }
            
            element.css('top', newTop + 'px');
            element.css('left', newLeft + 'px');
        }
    }
    
    function removeEntrantUI(uid) {
        console.log('removing entrant', uid);
        
        if (entrants[uid]) {
            $(entrants[uid]).remove();
            entrants[uid] = null;
        }
    }
    
    function addMessage(msg, cls) {
        if (!cls || cls === 'error') {
            console.warn(msg);
        }
        ui.msg
            .removeClass('success error info')
            .text(msg)
            .addClass(cls || 'error');
    }
    
    function downloadAudio(url, cb) {
        // No point in downloading audio if we can't us it.
        var audio = AudioContext && new AudioContext();
        if (audio) {
            var req = new XMLHttpRequest();
            req.open('GET', url, true);
            req.responseType = 'arraybuffer';

            req.onload = function() {
                audio.decodeAudioData(
                    req.response,
                    function(buffer) {
                        sounds[url] = buffer;
                        cb && cb(null, buffer);
                    },
                    function(err) {
                        console.warn('Unable to decode audio file:', url);
                        cb(err);
                    }
                );
            };
            req.send();
        }
    }
    
    function playAudio(url) {
        var audio = AudioContext && new AudioContext();
        if (audio && sounds[url]) {
            var source = audio.createBufferSource();
            source.buffer = sounds[url];
            source.connect(audio.destination);
            source.start(0);
        }
    }
    
    function vibrate(pattern) {
        pattern = pattern || [400, 150, 400, 150, 400];
        if (navigator['vibrate']) {
            navigator.vibrate(pattern);
        }
    }
    
    function checkBrowser() {
        if (!localStorage) {
            alert('Sorry! Your browser doesn\'t appear to support what we need. :(');
        }
    }

    return {
        initSetup: initSetup,
        initJoin: initJoin,
        initDraw: initDraw,
        addMessage: addMessage
    };

})(
    window.rdw || {},
    window.jqlite,
    window.AudioContext || window.webkitAudioContext
);
