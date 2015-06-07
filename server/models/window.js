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

const assert = require('assert'),
      redis = require('../lib/redis').createClient(),
      notification = require('../lib/notification'),
      log = require('../lib/log'),
      conf = require('../lib/conf'),
      conversationFactory = require('./conversation');

exports.create = function*(userId, conversationId) {
    return yield create(userId, conversationId);
};

exports.remove = function*(userId, windowId) {
    yield remove(userId, windowId);
};

exports.isValidDesktop = function*(userId, desktop) {
    let windows = yield redis.smembers(`windowlist:${userId}`);
    let found = false;

    for (let windowId of windows) {
        // TBD: Too many redis calls, re-factor to lua later.
        let existingDesktop = yield redis.hget(`window:${userId}:${windowId}`, 'desktop');

        if (existingDesktop && parseInt(existingDesktop) === desktop) {
            found = true;
            break;
        }
    }

    return found;
};

exports.removeByConversationId = function*(userId, conversationId) {
    let windows = yield redis.smembers(`windowlist:${userId}`);

    for (let masWindow of windows) {
        let myConversationId = yield getConversationId(userId, masWindow);

        if (myConversationId === conversationId) {
            yield remove(userId, masWindow);
        }
    }
};

exports.findByConversationId = function*(userId, conversationId) {
    assert(conversationId);

    return yield redis.hget('index:windowIds', userId + ':' + conversationId);
};

exports.getAllConversationIds = function*(userId) {
    return yield getAllConversationIds(userId);
};

exports.getWindowIdsForNetwork = function*(userId, network) {
    let windows = yield redis.smembers(`windowlist:${userId}`);
    let windowIds = [];

    for (let masWindow of windows) {
        let conversationId = yield getConversationId(userId, masWindow);
        let conversation = yield conversationFactory.get(conversationId);

        if (conversation.network === network) {
            windowIds.push(masWindow);
        }
    }

    return windowIds;
};

exports.getNetworks = function*(userId) {
    let conversationIds = yield getAllConversationIds(userId);
    let networks = {};
    let res = [];

    for (let conversationId of conversationIds) {
        let conversation = yield conversationFactory.get(conversationId);
        networks[conversation.network] = true;
    }

    Object.keys(networks).forEach(function(key) {
        res.push(key);
    });

    return res;
};

exports.getConversationId = function*(userId, windowId) {
    return yield getConversationId(userId, windowId);
};

function *create(userId, conversationId) {
    let windowId = yield redis.hincrby(`user:${userId}`, 'nextwindowid', 1);
    let conversation = yield conversationFactory.get(conversationId);
    let userId1on1 = null;

    assert(conversation);

    let currentDesktop = parseInt(yield redis.hget(`settings:${userId}`, 'activeDesktop'));

    let newWindow = {
        conversationId: conversationId,
        soundAlert: false,
        emailAlert: true,
        titleAlert: false,
        minimizedNamesList: false,
        desktop: currentDesktop || 0,
        row: 0,
        column: 0
    };

    yield redis.hmset(`window:${userId}:${windowId}`, newWindow);
    yield redis.sadd(`windowlist:${userId}`, windowId);

    if (conversation.type === '1on1') {
        let ids = Object.keys(conversation.members);
        userId1on1 = ids[0] === userId ? ids[1] : ids[0];
    }

    yield redis.hset('index:windowIds', userId + ':' + conversationId, windowId);

    yield notification.broadcast(userId, {
        id: 'CREATE',
        windowId: windowId,
        name: conversation.name,
        userId: userId1on1,
        type: conversation.type,
        network: conversation.network,
        password: conversation.password || null,
        topic: conversation.topic,
        emailAlert: newWindow.emailAlert,
        titleAlert: newWindow.titleAlert,
        row: newWindow.row,
        column: newWindow.column,
        soundAlert: newWindow.soundAlert,
        minimizedNamesList: newWindow.minimizedNamesList,
        desktop: newWindow.desktop,
        role: 'u' // Everybody starts as a normal user
    });

    yield sendBacklog(userId, conversationId, windowId);

    return windowId;
}

function *getAllConversationIds(userId) {
    let windows = yield redis.smembers(`windowlist:${userId}`);
    let conversationIds = [];

    for (let masWindow of windows) {
        let conversationId = yield getConversationId(userId, masWindow);
        conversationIds.push(conversationId);
    }

    return conversationIds;
}

function *getConversationId(userId, windowId) {
    return parseInt(yield redis.hget(`window:${userId}:${windowId}`, 'conversationId'));
}

function *remove(userId, windowId) {
    let conversationId = yield getConversationId(userId, windowId);

    log.info(userId, `Removing window, id: ${windowId}`);

    let deletedList = yield redis.srem(`windowlist:${userId}`, windowId);
    let deletedIndex = yield redis.hdel('index:windowIds', userId + ':' + conversationId);
    let deletedWindow = yield redis.del(`window:${userId}:${windowId}`);

    // TBD: Convert to assert when the situation are fully stable
    if (deletedList === 0) {
        log.warn(userId, 'windowlist entry missing.');
    } else if (deletedIndex === 0) {
        log.warn(userId, 'index:windowIds entry missing.');
    } else if (deletedWindow === 0) {
        log.warn(userId, 'window entry missing.');
    }

    yield notification.broadcast(userId, {
        id: 'CLOSE',
        windowId: parseInt(windowId)
    });
}

function *sendBacklog(userId, conversationId, windowId) {
    // TBD: This is same code as in initSession.lua
    let maxBacklogLines = conf.get('session:max_backlog');
    let lines = yield redis.lrange(`conversationmsgs:${conversationId}`, 0, maxBacklogLines - 1);

    if (!lines) {
        return;
    }

    for (let line of lines) {
        let message = JSON.parse(line);

        message.id = 'MSG';
        message.windowId = windowId;

        if (message.userId === userId && message.cat !== 'join' && message.cat !== 'part' &&
            message.cat !== 'quit') {
            message.cat = 'mymsg';
        }

        yield notification.broadcast(userId, message);
    }
}
