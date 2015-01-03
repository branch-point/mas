#!/usr/bin/env node --harmony
//
//   Copyright 2009-2014 Ilkka Oksanen <iao@iki.fi>
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing,
//   software distributed under the License is distributed on an "AS
//   IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
//   express or implied.  See the License for the specific language
//   governing permissions and limitations under the License.
//

'use strict';

require('../../lib/init')('irc');

var assert = require('assert'),
    co = require('co'),
    wait = require('co-wait'),
    log = require('../../lib/log'),
    redisModule = require('../../lib/redis'),
    redis = redisModule.createClient(),
    courier = require('../../lib/courier').createEndPoint('ircparser'),
    outbox = require('../../lib/outbox'),
    conversation = require('../../lib/conversation'),
    window = require('../../lib/window'),
    nicks = require('../../lib/nick');

const OPER = '@';
const VOICE = '+';
const USER = 'u';

co(function*() {
    yield redisModule.loadScripts();

    courier.on('send', processSend);
    courier.on('join', processJoin);
    courier.on('close', processClose);
    courier.on('updatePassword', processUpdatePassword);
    courier.on('updateTopic', processUpdateTopic);
    courier.on('whois', processWhois);
    courier.on('chat', processChat);
    courier.on('restarted', processRestarted);
    courier.on('data', processData);
    courier.on('connected', processConnected);
    courier.on('disconnected', processDisconnected);
    courier.start();
})();

// Upper layer messages

function *processSend(params) {
    var target = params.conversationName;

    assert(!params.conversationId);

    if (params.conversationType === '1on1') {
        var targetUserId = yield conversation.getPeerUserId(params.conversationId, params.userId);
        target = yield getUserNick(targetUserId);

        if (!target) {
            // Both participants are MAS users, no need to go through IRC
            return;
        }
    }

    yield courier.send('connectionmanager', {
        type: 'write',
        userId: params.userId,
        network: params.conversationNetwork,
        line: 'PRIVMSG ' + target + ' :' + params.text
    });
}

function *processJoin(params) {
    var state = yield redis.hget('networks:' + params.userId + ':' + params.network, 'state');
    var channelName = params.name;
    var hasChannelPrefixRegex = /^[&#!+]/;
    var illegalNameRegEx = /\s|\cG|,/; // See RFC2812, section 1.3

    if (!channelName || channelName === '' || illegalNameRegEx.test(channelName)) {
        yield outbox.queue(params.userId, params.sessionId, {
            id: 'JOIN_RESP',
            status: 'ERROR',
            errorMsg: 'Illegal or missing channel name.'
        });
        return;
    }

    if (!hasChannelPrefixRegex.test(channelName)) {
        channelName = '#' + channelName;
    }

    if (!state || state === 'disconnected') {
        yield connect(params.userId, params.network);
    } else if (state === 'connected') {
        yield courier.send('connectionmanager', {
            type: 'write',
            userId: params.userId,
            network: params.network,
            line: 'JOIN ' + channelName + ' ' + params.password
        });
    }

    var conversationId = yield conversation.findGroup(channelName, params.network);

    if (!conversationId) {
        conversationId = yield conversation.create({
            owner: params.userId,
            type: 'group',
            name: channelName,
            network: params.network,
        });
    }

    var membersHash = {};
    membersHash[params.userId] = 'u';

    yield conversation.setGroupMembers(conversationId, membersHash, false);
    yield window.create(params.userId, conversationId);

    yield outbox.queue(params.userId, params.sessionId, {
        id: 'JOIN_RESP',
        status: 'OK'
    });
}

function *processChat(params) {
    var conversationId = yield conversation.find1on1(
        params.userId, params.targetUserId, params.network);

    if (!conversationId) {
        yield setup1on1(params.userId, params.targetUserId, params.network);
    }

    yield outbox.queue(params.userId, params.sessionId, {
        id: 'CHAT_RESP',
        status: 'OK'
    });
}

function *processClose(params) {
    var state = yield redis.hget('networks:' + params.userId + ':' + params.network, 'state');

    if (state === 'connected' && params.windowType === 'group') {
        yield sendIRCPart(params.userId, params.network, params.name);
    }

    if (params.last) {
        yield disconnect(params.userId, params.network);
    }
}

function *processUpdatePassword(params) {
    var state = yield redis.hget('networks:' + params.userId + ':' + params.network, 'state');
    var modeline = 'MODE ' + params.name + ' ';

    if (params.password === null) {
        modeline += '-k foobar'; // IRC protocol is odd, -k requires dummy parameter
    } else {
        modeline += '+k ' + params.password;
    }

    if (state !== 'connected') {
        yield outbox.queue(params.userId, params.sessionId, {
            id: 'UPDATE_PASSWORD_RESP',
            status: 'ERROR',
            errorMsg: 'Can\'t change the password. You are not connected to the IRC network'
        });
    } else {
        yield courier.send('connectionmanager', {
            type: 'write',
            userId: params.userId,
            network: params.network,
            line: modeline
        });

        yield outbox.queue(params.userId, params.sessionId, {
            id: 'UPDATE_PASSWORD_RESP',
            status: 'OK'
        });
    }
}

function *processUpdateTopic(params) {
    var state = yield redis.hget('networks:' + params.userId + ':' + params.network, 'state');

    if (state !== 'connected') {
        yield outbox.queue(params.userId, params.sessionId, {
            id: 'UPDATE_TOPIC_RESP',
            status: 'ERROR',
            errorMsg: 'Can\'t change the topic. You are not connected to the IRC network'
        });
    } else {
        yield courier.send('connectionmanager', {
            type: 'write',
            userId: params.userId,
            network: params.network,
            line: 'TOPIC ' + params.name + ' :' + params.topic
        });

        yield outbox.queue(params.userId, params.sessionId, {
            id: 'UPDATE_TOPIC_RESP',
            status: 'OK'
        });
    }
}

function *processWhois(params) {
    yield courier.send('connectionmanager', {
        type: 'write',
        userId: params.userId,
        network: params.network,
        line: 'WHOIS ' + params.nick
    });
}

// Connection manager messages

// Restarted
function *processRestarted() {
    var allUsers = yield redis.smembers('userlist');

    for (var i = 0; i < allUsers.length; i++) {
        var userId = allUsers[i];
        var networks = yield window.getNetworks(userId);

        for (var ii = 0; ii < networks.length; ii++) {
            var network = networks[ii];

            if (network !== 'MAS') {
                log.info(userId, 'Scheduling connect() to IRC network: ' + network);

                yield addSystemMessage(userId, network,
                    'MAS Server restarted. Global rate limiting to avoid flooding IRC ' +
                    ' server enabled. Next connect will be slow.');

                yield connect(userId, network);
            }
        }
    }
}

// Data
function *processData(params) {
    var line = params.line.trim(),
        parts = line.split(' '),
        msg = {
            params: [],
            network: params.network
        };

    // See rfc2812

    if ((line.charAt(0) === ':')) {
        // Prefix exists
        var prefix = parts.shift();

        var nickEnds = prefix.indexOf('!');
        var identEnds = prefix.indexOf('@');

        if (nickEnds === -1 && identEnds === -1) {
            msg.serverName = prefix.substring(1);
        } else {
            msg.nick = prefix.substring(1, Math.min(nickEnds, identEnds));
            msg.userNameAndHost = prefix.substring(Math.min(nickEnds + 1, identEnds + 1));
        }
    }

    msg.command = parts.shift();

    if (msg.command.match(/^[0-9]+$/) !== null) {
        // Numeric reply
        msg.target = parts.shift();

        if (/^[&#!+]/.test(msg.target)) {
            // Channel names are case insensitive, always use lower case version
            msg.target = msg.target.toLowerCase();
        }
    }

    // Only the parameters are left now
    while (parts.length !== 0) {
        if (parts[0].charAt(0) === ':') {
            msg.params.push(parts.join(' ').substring(1));
            break;
        } else {
            msg.params.push(parts.shift());
        }
    }

    if (handlers[msg.command]) {
        yield handlers[msg.command](params.userId, msg, msg.command);
    }
}

// Connected
function *processConnected(params) {
    var user = yield redis.hgetall('user:' + params.userId);
    log.info(params.userId, 'Connected to IRC server');

    var commands = [
        'NICK ' + user.nick,
        'USER ' + user.nick + ' 8 * :Real Name (Ralph v1.0)'
    ];

    yield courier.send('connectionmanager', {
        type: 'write',
        userId: params.userId,
        network: params.network,
        line: commands
    });
}

// Disconnected
function *processDisconnected(params) {
    var userId = params.userId;
    var network = params.network;
    var previousState = yield redis.hget('networks:' + userId + ':' + network, 'state');

    yield redis.hset('networks:' + userId + ':' + network, 'state', 'disconnected');
    yield nicks.removeCurrentNick(userId, network);

    if (previousState === 'closing') {
        // We wanted to close the connection, don't reconnect
        return;
    }

    var delay = 30 * 1000; // 30s
    var msg = 'Lost connection to IRC server (' + params.reason + '). Will try to reconnect in ';
    var count = yield redis.hincrby('networks:' + userId + ':' + network, 'retryCount', 1);

    // Set the backoff timer
    if (count < 4) {
        msg = msg + '30 seconds.';
    } else if (count < 8) {
        delay = 3 * 60 * 1000; // 3 mins
        msg = msg + '3 minutes.';
    } else if (count >= 8) {
        delay = 60 * 60 * 1000; // 1 hour
        msg = 'Error in connection to IRC server after multiple attempts. Waiting one hour ' +
            'before making another connection attempt. Close this window if you do not wish ' +
            'to retry.';
    }

    yield addSystemMessage(userId, network, msg);

    co(function*() {
        yield wait(delay);
        yield connect(params.userId, params.network, true);
    })();
}

function *addSystemMessage(userId, network, body) {
    var conversationId = yield conversation.find1on1(userId, 'SERVER', network);

    if (!conversationId) {
        conversationId = yield conversation.create({
            owner: userId,
            type: '1on1',
            network: network,
            topic: 'IRC SERVER MESSAGES',
        });

        yield conversation.set1on1Members(conversationId, userId, 'SERVER');
        yield window.create(userId, conversationId);
    }

    yield conversation.addMessage(conversationId, 0, {
        userId: 'SERVER',
        cat: 'info',
        body: body
    });
}

function *connect(userId, network, skipRetryCountReset) {
    var nick = yield redis.hget('user:' + userId, 'nick');
    yield nicks.updateCurrentNick(userId, network, nick);

    yield redis.hset('networks:' + userId + ':' + network, 'state', 'connecting');

    if (!skipRetryCountReset) {
        yield resetRetryCount(userId, network);
    }

    yield addSystemMessage(userId, network, 'INFO: Connecting to IRC server...');

    yield courier.send('connectionmanager', {
        type: 'connect',
        userId: userId,
        nick: nick,
        network: network
    });
}

function *disconnect(userId, network) {
    yield redis.hset('networks:' + userId + ':' + network, 'state', 'closing');

    yield courier.send('connectionmanager', {
        type: 'disconnect',
        userId: userId,
        network: network
    });
}

// Process different IRC commands

var handlers = {
    '001': handleServerText,
    '002': handleServerText,
    '003': handleServerText,
    '005': handleServerText,
    '020': handleServerText,
    '042': handleServerText,
    '043': handle043,
    242: handleServerText,
    250: handleServerText,
    251: handleServerText,
    252: handleServerText,
    253: handleServerText,
    254: handleServerText,
    255: handleServerText,
    265: handleServerText,
    266: handleServerText,
    372: handleServerText,
    375: handleServerText,
    452: handleServerText,

    332: handle332,
    353: handle353,
    366: handle366,
    376: handle376,
    433: handle433,
    482: handle482,

    JOIN: handleJoin,
    PART: handlePart,
    QUIT: handleQuit,
    NICK: handleNick,
    MODE: handleMode,
    TOPIC: handleTopic,
    PRIVMSG: handlePrivmsg,
    ERROR: handleError
};

function *handleServerText(userId, msg, code) {
    // :mas.example.org 001 toyni :Welcome to the MAS IRC toyni
    var text = msg.params.join(' ');
    var cat = 'info';

    if (!text) {
        return;
    }

    // 375 = MOTD line
    if (code === '372') {
        cat = 'banner';
    }

    yield addSystemMessage(userId, msg.network, text);
}

function *handle043(userId, msg) {
    // :*.pl 043 AnDy 0PNEAKPLG :nickname collision, forcing nick change to your unique ID.
    var newNick = msg.params[0];
    yield nicks.updateCurrentNick(userId, msg.network, newNick);

    yield tryDifferentNick(userId, msg.network);
}

function *handle332(userId, msg) {
    // :portaali.org 332 ilkka #portaali :Cool topic
    var channel = msg.params[0];
    var topic = msg.params[1];
    var conversationId = yield conversation.findGroup(channel, msg.network);

    yield conversation.setTopic(conversationId, topic);
}

function *handle353(userId, msg) {
    // :own.freenode.net 353 drwillie @ #evergreenproject :drwillie ilkkaoks
    var channel = msg.params[1];
    var conversationId = yield conversation.findGroup(channel, msg.network);
    var names = msg.params[2].split(' ');

    yield bufferNames(names, userId, msg.network, conversationId);
}

function *handle366(userId, msg) {
    // :pratchett.freenode.net 366 il3kkaoksWEB #testi1 :End of /NAMES list.
    var channel = msg.params[0];
    var conversationId = yield conversation.findGroup(channel, msg.network);
    var namesHash = yield redis.hgetall('namesbuffer:' + userId + ':' + conversationId);

    yield conversation.setGroupMembers(conversationId, namesHash, true);

    for (var user in namesHash) {
        if (namesHash.hasOwnProperty(user) && user.charAt(0) === 'm') {
            yield conversation.sendAddMembers(user, conversationId);
        }
    }
}

function *handle376(userId, msg) {
    yield redis.hset('networks:' + userId + ':' + msg.network, 'state', 'connected');
    yield resetRetryCount(userId, msg.network);

    var conversationIds = yield window.getAllConversationIds(userId);
    var channelsToJoin = [];

    for (var i = 0; i < conversationIds.length; i++) {
        var ircConversation = yield conversation.get(conversationIds[i]);

        if (ircConversation.network === msg.network && ircConversation.type === 'group') {
            channelsToJoin.push(ircConversation.name);
        }
    }

    if (channelsToJoin.length === 0) {
        log.info(userId, 'Connected, but no channels/1on1s to join. Disconnecting');
        yield disconnect(userId, msg.network);
        return;
    }

    for (i = 0; i < channelsToJoin.length; i++) {
        yield courier.send('connectionmanager', {
            type: 'write',
            userId: userId,
            network: msg.network,
            line: 'JOIN ' + channelsToJoin[i]
        });
    }

    yield nicks.sendNickAll(userId);
}

function *handle433(userId, msg) {
    // :mas.example.org 433 * ilkka :Nickname is already in use.
    yield tryDifferentNick(userId, msg.network);
}

function *handle482(userId, msg) {
    // irc.localhost 482 ilkka #test2 :You're not channel operator
    var channel = msg.params[0];

    yield addSystemMessage(userId, msg.network, 'You\'re not channel operator on ' + channel);
}

function *handleJoin(userId, msg) {
    // :neo!i=ilkkao@iao.iki.fi JOIN :#testi4
    var channel = msg.params[0];
    var conversationId = yield conversation.findGroup(channel, msg.network);

    yield conversation.addGroupMember(conversationId, userId);
}

function *handleQuit(userId, msg) {
    // :ilkka!ilkkao@localhost.myrootshell.com QUIT :"leaving"
    //var reason = msg.params[0];
    var targetUserId = getOrCreateUserId(msg.nick, msg.network);

    var conversationIds = yield window.getAllConversationIdsWithUserId(userId, targetUserId);

    for (var i = 0; i < conversationIds.length; i++) {
        // TBD: Send a real quit message instead of part
        yield conversation.removeGroupMember(conversationIds[i], targetUserId);
    }
}

function *handleNick(userId, msg) {
    // :ilkkao!~ilkkao@localhost NICK :foobar
    var newNick = msg.params[0];
    var currentNick = yield nicks.getCurrentNick(userId, msg.network);

    if (msg.nick === currentNick) {
        // User's own nick is changing
        yield nicks.updateCurrentNick(userId, msg.network, newNick);
    }

    var targetUserId = yield getOrCreateUserId(msg.nick, msg.network);
    var conversationIds = yield window.getAllConversationIdsWithUserId(userId, targetUserId);

    // TBD: update ircuser database and send USERS update

    for (var i = 0; i < conversationIds.length; i++) {
        yield conversation.addMessage(conversationIds[i], 0, {
            cat: 'info',
            body: msg.nick + ' is now known as ' + newNick
        });
    }
}

function *handleError(userId, msg) {
    var reason = msg.params[0];

    yield addSystemMessage(userId, msg.network, 'Connection lost. Server error: ' + reason);

    if (reason.indexOf('Too many host connections') !== -1) {
        log.error(userId, 'Too many connections to: ' + msg.network);

        yield addSystemMessage(userId, msg.network,
            msg.network + ' IRC network doesn\'t allow more connections. ' +
            'Close this window and rejoin to try again.');

        // Disable auto-reconnect
        yield redis.hset('networks:' + userId + ':' + msg.network, 'state', 'closing');
    }
}

function *handlePart(userId, msg) {
    // :ilkka!ilkkao@localhost.myrootshell.com PART #portaali :
    var channel = msg.params[0];
    //var reason = msg.params[1]; // TBD: Can there be reason?
    var conversationId = yield conversation.findGroup(channel, msg.network);
    var targetUserId = yield getOrCreateUserId(msg.nick, msg.network);

    yield conversation.removeGroupMember(conversationId, targetUserId);
}

function *handleMode(userId, msg) {
    // :ilkka9!~ilkka9@localhost.myrootshell.com MODE #sunnuntai +k foobar3
    var target = msg.params[0];

    if (!isChannel(target)) {
        // TDB: Handle user's mode change
        return;
    }

    var conversationId = yield conversation.findGroup(target, msg.network);

    yield conversation.addMessage(conversationId, {
        cat: 'info',
        body: 'Mode change: ' + msg.params.join(' ') + ' by ' +
            (msg.nick ? msg.nick : msg.serverName)
    });

    var modeParams = msg.params.slice(1);

    while (modeParams.length !== 0) {
        var command = modeParams.shift();
        var oper = command.charAt(0);
        var modes = command.substring(1).split('');
        var param;

        if (!(oper === '+' || oper === '-' )) {
            log.warn(userId, 'Received broken MODE command');
            continue;
        }

        for (var i = 0; i < modes.length; i++) {
            var mode = modes[i];
            var newClass = null;

            if (mode.match(/[klbeIOov]/)) {
                param = modeParams.shift();

                if (!param) {
                    log.warn(userId, 'Received broken MODE command');
                }
            }

            var targetUserId = yield getOrCreateUserId(param, msg.network);

            if (mode === 'o' && oper === '+') {
                // Got oper status
                newClass = OPER;
            } else if (mode === 'o' && oper === '-') {
                // Lost oper status
                newClass = USER;
            } else if (mode === 'v') {
                var oldClass = yield conversation.getMemberRole(conversationId, targetUserId);

                if (oldClass !== OPER) {
                    if (oper === '+') {
                        // Non-oper got voice
                        newClass = VOICE;
                    } else {
                        // Non-oper lost voice
                        newClass = USER;
                    }
                }
            } else if (mode === 'k') {
                yield conversation.setPassword(conversationId, oper === '+' ? param : '');
            }

            if (newClass) {
                yield conversation.setMemberRole(conversationId, targetUserId, newClass);
            }
        }
    }
}

function *handleTopic(userId, msg) {
    // :ilkka!ilkkao@localhost.myrootshell.com TOPIC #portaali :My new topic
    var channel = msg.params[0];
    var topic = msg.params[1];
    var conversationId = yield conversation.findGroup(channel, msg.network);

    yield conversation.setTopic(conversationId, topic);

    yield conversation.addMessage(userId, 0, {
        cat: 'info',
        body: msg.nick + ' has changed the topic to: "' + topic + '".'
    });
}

function *handlePrivmsg(userId, msg) {
    var target = msg.params[0];
    var text = msg.params[1];
    var currentNick = yield nicks.getCurrentNick(userId, msg.network);
    var conversationId;

    if (target === currentNick) {
        // Message is for the user only
        var peerUserId = getOrCreateUserId(msg.nick, msg.network);
        conversationId = yield conversation.find1on1(userId, peerUserId, msg.network);

        if (conversationId === null) {
            conversationId = yield setup1on1(userId, peerUserId, msg.network);
        }
    } else {
        conversationId = yield conversation.findGroup(target, msg.network);

        if (conversationId === null) {
            log.warn(userId, 'Message arrived for an unknown channel');
            return;
        }
    }

    yield conversation.addMessage(conversationId, 0, {
        userId: getOrCreateUserId(msg.nick, msg.network),
        cat: 'msg',
        body: text
    });
}

function *tryDifferentNick(userId, network) {
    // TBD Set currentnick to nick and send NICK periodically to trigger this
    // method to try to reclaim the real nick

    var nick = yield redis.hget('user:' + userId, 'nick');
    var currentNick = yield nicks.getCurrentNick(userId, network);

    var state = yield redis.hget('networks:' + userId + ':' + network, 'state');
    var nickHasNumbers = false;

    if (nick !== currentNick.substring(0, nick.length)) {
        // Current nick is unique ID, let's try to change it to something unique immediately
        currentNick = nick + (100 + Math.floor((Math.random() * 900)));
    } else if (currentNick === nick) {
        // Second best choice
        currentNick = nick + '_';
    } else if (currentNick === nick + '_') {
        // Third best choice
        currentNick = nick + (Math.floor((Math.random() * 10)));
        nickHasNumbers = true;
    } else {
        // If all else fails, keep adding random numbers
        currentNick = currentNick + (Math.floor((Math.random() * 10)));
        nickHasNumbers = true;
    }

    yield nicks.updateCurrentNick(userId, network, currentNick);

    // If we are joining IRC try all alternatives. If we are connected,
    // try to get only 'nick' or 'nick_' back
    if (!(state === 'connected' && nickHasNumbers)) {
        yield courier.send('connectionmanager', {
            type: 'write',
            userId: userId,
            network: network,
            line: 'NICK ' + currentNick
        });
    }
}

//add timer vartin? valein tarkista jonkun userin NAMESILLA kaikki kanavat

function *sendIRCPart(userId, network, channel) {
    yield courier.send('connectionmanager', {
        type: 'write',
        userId: userId,
        network: network,
        line: 'PART ' + channel
    });
}

function *bufferNames(names, userId, network, conversationId) {
    var namesHash = {};

    for (var i = 0; i < names.length; i++) {
        var nick = names[i];
        var userClass = USER;

        switch (nick.charAt(0)) {
            case '@':
                userClass = OPER;
                break;
            case '+':
                userClass = VOICE;
                break;
        }

        if (userClass === OPER || userClass === VOICE) {
            nick = nick.substring(1);
        }

        var memberUserId = yield getOrCreateUserId(nick, network);
        namesHash[memberUserId] = userClass;
    }

    var key = 'namesbuffer:' + userId + ':' + conversationId;
    yield redis.hmset(key, namesHash);
    yield redis.expire(key, 60); // 1 minute. Does cleanup if we never get End of NAMES list reply.
}

function *resetRetryCount(userId, network) {
    yield redis.hset('networks:' + userId + ':' + network, 'retryCount', 0);
}

function isChannel(text) {
    return [ '&', '#', '+', '!' ].some(function(element) {
        return element === text.charAt(0);
    });
}

function *getOrCreateUserId(nick, network) {
    var userId = yield nicks.getUserIdFromNick(nick, network);

    if (userId) {
        return userId;
    }

    userId = yield redis.hget('index:ircuser', network + ':' + nick);

    if (!userId) {
        userId = yield createUserId(nick, network);
    }

    return userId;
}

function *createUserId(nick, network) {
    var userId = yield redis.incr('nextGlobalIrcUserId');
    userId = 'i' + userId;

    yield redis.hmset('ircuser:' + userId, {
        nick: nick,
        network: network
    });
    yield redis.hset('index:ircuser', network + ':' + nick, userId);

    return userId;
}

function *getUserNick(userId) {
    return yield redis.hget('ircuser:' + userId, 'nick');
}

function *setup1on1(userId, peerUserId, network) {
    var conversationId = yield conversation.create({
        owner: userId,
        type: '1on1',
        name: '',
        network: network,
    });

    yield conversation.set1on1Members(conversationId, userId, peerUserId);
    yield window.create(userId, conversationId);

    return conversationId;
}
