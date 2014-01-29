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

var log = require('../lib/log'),
    wrapper = require('co-redis'),
    redis = wrapper(require('redis').createClient()),
    courier = require('../lib/courier').createEndPoint('ircparser'),
    textLine = require('../server/lib/textLine');

var serverList = {
    MeetAndSpeak: { host: 'localhost', port: 6667, unknown: 9999 },
    Eversible: { host: 'ircnet.eversible.com', port: 6666, unknown: 100 },
    FreeNode: { host: 'irc.freenode.net', port: 6667, unknown: 5 },
    W3C: { host: 'irc.w3.org', port: 6665, unknown: 5 }
};

// Upper layer messages

// addText
courier.on('addText', function *(params) {
    yield courier.send('connectionmanager', {
        type: 'write',
        userId: params.userId,
        network: params.network,
        line: 'PRIVMSG #test ' + params.text
    });
});

// Connection manager messages

// Ready
courier.on('ready', function *() {
    yield init();
});

// Data
courier.on('data', function *(params) {
    var line = params.line,
        parts = line.split(' '),
        msg = {};

    // See rfc2812

    if ((line.charAt(0) === ':')) {
        // Prefix exists
        var prefix = parts.shift();

        var nickEnds = prefix.indexOf('!');
        var identEnds = prefix.indexOf('@');

        if (nickEnds === -1 && identEnds === -1) {
            msg.serverName = prefix;
        } else {
            msg.nick = prefix.substring(1, Math.min(nickEnds, identEnds));
            msg.userNameAndHost = prefix.substring(Math.min(nickEnds, identEnds));
        }
    }

    msg.command = parts.shift();

    if (msg.command.match(/^[0-9]+$/) !== null) {
        // Numeric reply
        msg.target = parts.shift();
    }

    msg.params = [];

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
        yield handlers[msg.command](params.userId, params.network, msg);
    }
});

// Connected
courier.on('connected', function *(params) {
    var userInfo = yield redis.hgetall('user:' + params.userId);
    log.info('Importing user ' + userInfo.nick);

    var commands = [
        'NICK ' + userInfo.nick,
        'USER ' + userInfo.nick + ' 8 * :Real Name (Ralph v1.0)'
    ];

    yield courier.send('connectionmanager', {
        type: 'write',
        userId: params.userId,
        network: params.network,
        line: commands
    });
});

// Disconnect
courier.on('disconnected', function() {
    //TBD
});

function *init() {
    var allUsers = yield redis.smembers('userlist');

    for (var i = 0; i < allUsers.length; i++) {
        var userId = allUsers[i];

        var connectDelay = Math.floor((Math.random() * 180));
        connectDelay = connectDelay; // TBD
        // TBD: Get user's networks. Connect to them.

        // MeetAndSpeak network, connect always, no delay
        yield courier.send('connectionmanager', {
            type: 'connect',
            userId: userId,
            network: 'MeetAndSpeak',
            host: serverList.MeetAndSpeak.host,
            port: serverList.MeetAndSpeak.port
        });
    }
}

// Process different IRC commands

var handlers = {
    '001': handleServerText,
    '002': handleServerText,
    '003': handleServerText,
    '005': handleServerText,
    '020': handleServerText,
    '042': handleServerText,
    '242': handleServerText,
    '250': handleServerText,
    '251': handleServerText,
    '252': handleServerText,
    '253': handleServerText,
    '254': handleServerText,
    '255': handleServerText,
    '265': handleServerText,
    '266': handleServerText,
    '372': handleServerText,
    '375': handleServerText,
    '452': handleServerText,

    '376': handle376,

    'PRIVMSG': handlePrivmsg,
    'PING': handlePing
};

function *handleServerText(userId, network, msg) {
    //:mas.example.org 001 toyni :Welcome to the MAS IRC toyni
    var text = msg.params.join(' ');

    yield textLine.broadcast(userId, network, null, 'notice', text);
}

function *handlePing(userId, network, msg) {
    var server = msg.params[0];
    var resp = 'PONG ' + server;

    yield courier.send('connectionmanager', {
        type: 'write',
        userId: userId,
        network: network,
        line: resp
    });
}

function *handle376(userId, network, msg) {
    msg = msg; // TBD

    var resp = 'JOIN #test';

    yield courier.send('connectionmanager', {
        type: 'write',
        userId: userId,
        network: network,
        line: resp
    });
}

function *handlePrivmsg(userId, network, msg) {
    //var target = msg.params[0];
    var text = msg.params[1];

    // if (0) { // TBD target === currentNick

    // } else {

    // }

    yield textLine.broadcast(userId, network, msg.nick, 'msg', text);
}
