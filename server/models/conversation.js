//
//   Copyright 2014 Ilkka Oksanen <iao@iki.fi>
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
      uuid = require('uid2'),
      redis = require('../lib/redis').createClient(),
      log = require('../lib/log'),
      search = require('../lib/search'),
      notification = require('../lib/notification'),
      window = require('./window'),
      nick = require('./nick');

let MSG_BUFFER_SIZE = 200; // TBD: This should come from session:max_backlog setting

exports.create = function*(options) {
    return yield create(options);
};

exports.delete = function*(conversationId) {
    let conversation = yield get(conversationId);
    yield conversation._remove();
};

exports.get = function*(conversationId) {
    return yield get(conversationId);
};

exports.getAllIncludingUser = function*(userId) {
    // conversationlist structure must be maintained. Getting this information from windowlist would
    // work only for MAS users, not for external (IRC) users
    let conversations = [];
    let conversationIds = (yield redis.smembers(`conversationlist:${userId}`)) || [];

    for (let conversationId of conversationIds) {
        conversations.push(yield get(conversationId));
    }

    return conversations;
};

exports.findGroup = function*(name, network) {
    assert(network && name);

    let conversationId = yield redis.hget(
        'index:conversation', 'group:' + network + ':' + name.toLowerCase());

    if (!conversationId) {
        log.info('Searched non-existing group: ' + network + ':' + name);
    }

    return yield get(conversationId);
};

exports.findOrCreate1on1 = function*(userId, peerUserId, network) {
    assert(userId && peerUserId && network);

    let conversation;
    let userIds = [ userId, peerUserId ].sort();
    let conversationId = yield redis.hget('index:conversation',
        '1on1:' + network + ':' + userIds[0] + ':' + userIds[1]);

    // TBD: Make sure peerUserId is either valid MAS user or that user doesn't have too many
    // 1on1 conversations.

    if (!conversationId) {
        conversation = yield create({
            owner: userId,
            type: '1on1',
            name: '',
            network: network
        });

        yield conversation.set1on1Members(userId, peerUserId);
    } else {
        conversation = yield get(conversationId);
    }

    return conversation;
};

function Conversation(conversationId, record, members) {
    this.conversationId = conversationId;

    Object.keys(record).forEach(function(prop) {
        this[prop] = record[prop];
    }.bind(this));

    this.members = members;

    return this;
}

Conversation.prototype.getMemberRole = function*(userId) {
    return this.members[userId];
};

Conversation.prototype.setMemberRole = function*(userId, role) {
    yield this._setMember(userId, role);
    yield this._streamAddMembers(userId, role);
};

Conversation.prototype.getPeerUserId = function*(userId) {
    let members = Object.keys(this.members);
    return members[0] === userId ? members[1] : members[0];
};

Conversation.prototype.set1on1Members = function*(userId, peerUserId) {
    let userIds = [ userId, peerUserId ].sort();
    let userHash = {};

    userHash[userId] = 'u';
    userHash[peerUserId] = 'u';

    yield this._insertMembers(userHash);

    // Update 1on1 index
    yield redis.hset('index:conversation',
        '1on1:' + this.network + ':' + userIds[0] + ':' + userIds[1], this.conversationId);

    // Update 1on1 conversation history
    if (userId.charAt(0) === 'm') {
        yield redis.sadd(`1on1conversationhistory:${userId}`, this.conversationId);
    }

    if (peerUserId.charAt(0) === 'm') {
        yield redis.sadd(`1on1conversationhistory:${peerUserId}`, this.conversationId);
    }
};

Conversation.prototype.setGroupMembers = function*(members) {
    let oldMembers = Object.keys(this.members);

    for (let userId of oldMembers) {
        if (members && !members[userId]) {
            yield this.removeGroupMember(userId, true);
        }
    }

    yield this._insertMembers(members);

    let newMembers = Object.keys(members);

    for (let userId of newMembers) {
        if (userId.charAt(0) === 'm') {
            yield this.sendAddMembers(userId);
        }
    }
};

Conversation.prototype.addGroupMember = function*(userId, role) {
    assert(role === 'u' || role === '+' || role === '@' || role === '*');

    let newField = yield this._setMember(userId, role);

    if (newField) {
        yield this.addMessage({
            userId: userId,
            cat: 'join',
            body: ''
        });

        yield this._streamAddMembers(userId, role);
    }
};

Conversation.prototype.removeGroupMember = function*(userId, skipCleanUp, wasKicked, reason) {
    assert(this.type === 'group');

    let removed = yield redis.hdel(`conversationmembers:${this.conversationId}`, userId);
    yield redis.srem(`conversationlist:${userId}`, this.conversationId);

    if (removed === 1) {
        log.info(`User: ${userId} removed from conversation: ${this.conversationId}`);

        delete this.members[userId];

        yield this.addMessage({
            userId: userId,
            cat: wasKicked ? 'kick' : 'part',
            body: wasKicked && reason ? reason : ''
        });

        yield this._streamRemoveMembers(userId);

        // Never let window to exist alone without linked conversation
        yield this._removeConversationWindow(userId);

        let removeConversation = true;

        Object.keys(this.members).forEach(function(member) {
            if (member.charAt(0) === 'm') {
                removeConversation = false;
            }
        });

        if (removeConversation && !skipCleanUp) {
            log.info(userId,
                'Last member parted, removing conversation, id: ' + this.conversationId);
            yield this._remove(this);
        }
    }
};

Conversation.prototype.remove1on1Member = function*(userId) {
    assert(this.members[userId]);

    // Never let window to exist alone without linked conversation
    yield this._removeConversationWindow(userId);

    // No clean-up is currently needed. 1on1 discussions are never deleted. Group discussions
    // are deleted when the last member parts. This makes sense as groups are then totally reseted
    // when they become empty (TBD: except elasticsearch contains orphan logs). Never deleting
    // 1on1 conversations makes log searching from elasticsearch possible. TBD: On the other hand
    // dead 1on1s start to pile eventually on Redis.
};

Conversation.prototype.isMember = function*(userId) {
    return !!this.members[userId];
};

Conversation.prototype.addMessage = function*(msg, excludeSession) {
    msg.gid = yield redis.incr('nextGlobalMsgId');
    msg.ts = Math.round(Date.now() / 1000);

    yield this._scanForEmailNotifications(msg);

    yield redis.lpush(`conversationmsgs:${this.conversationId}`, JSON.stringify(msg));
    yield redis.ltrim(`conversationmsgs:${this.conversationId}`, 0, MSG_BUFFER_SIZE - 1);

    yield this._streamMsg(msg, excludeSession);

    search.storeMessage(this.conversationId, msg);

    return msg;
};

Conversation.prototype.addMessageUnlessDuplicate = function*(sourceUserId, msg, excludeSession) {
    // A special filter for IRC backend.

    // To support Flowdock network where MAS user's message can come from the IRC server
    // (before all incoming messages from MAS users were ignored as delivery had happened
    // already locally) the overall logic is complicated. The code in the lua method now
    // works because IRC server doesn't echo messages back to their senders. If that wasn't
    // the case, lua reporter logic would fail. (If a reporter sees a new identical message
    // it's not considered as duplicate. Somebody is just repeating their line.)
    let duplicate = yield redis.run('duplicateMsgFilter', sourceUserId, this.conversationId,
        msg.userId, msg.body);

    if (!duplicate) {
        return yield this.addMessage(msg, excludeSession);
    }

    return {};
};

Conversation.prototype.editMessage = function*(userId, gid, text) {
    let result = yield redis.run('editMessage', this.conversationId, gid, userId, text);

    if (!result) {
        return false;
    }

    let msg = JSON.parse(result);
    msg.id = 'MSG';

    yield this._streamMsg(msg);

    return true;
};

Conversation.prototype.sendAddMembers = function*(userId) {
    let windowId = yield window.findByConversationId(userId, this.conversationId);
    let membersList = [];

    Object.keys(this.members).forEach(function(key) {
        membersList.push({
            userId: key,
            role: this.members[key]
        });
    }.bind(this));

    yield notification.broadcast(userId, {
        id: 'ADDMEMBERS',
        windowId: parseInt(windowId),
        reset: true,
        members: membersList
    });
};

Conversation.prototype.sendUsers = function*(userId) {
    let userIds = Object.keys(this.members);

    for (let masUserId of userIds) {
        yield redis.run('introduceNewUserIds', masUserId, null, null, true, userId);
    }
};

Conversation.prototype.setTopic = function*(topic, nickName) {
    let changed = yield redis.run('setConversationField', this.conversationId, 'topic', topic);

    if (!changed) {
        return;
    }

    this.topic = topic;

    yield this._stream({
        id: 'UPDATE',
        topic: topic
    });

    yield this.addMessage({
        cat: 'info',
        body: nickName + ' has changed the topic to: "' + topic + '".'
    });
};

Conversation.prototype.setPassword = function*(password) {
    let changed = yield redis.run(
        'setConversationField', this.conversationId, 'password', password);

    if (!changed) {
        return;
    }

    this.password = password;

    yield this._stream({
        id: 'UPDATE',
        password: password
    });

    let text = password === '' ?
        'Password protection has been removed from this channel.' :
        'The password for this channel has been changed to ' + password + '.';

    yield this.addMessage({
        cat: 'info',
        body: text
    });
};

Conversation.prototype._streamMsg = function*(msg, excludeSession) {
    msg.id = 'MSG';
    yield this._stream(msg, excludeSession);
};

Conversation.prototype._streamAddMembers = function*(userId, role) {
    yield this._stream({
        id: 'ADDMEMBERS',
        reset: false,
        members: [ {
            userId: userId,
            role: role
        } ]
    });
};

Conversation.prototype._streamRemoveMembers = function*(userId) {
    yield this._stream({
        id: 'DELMEMBERS',
        members: [ {
            userId: userId
        } ]
    });
};

Conversation.prototype._stream = function*(msg, excludeSession) {
    let members = Object.keys(this.members);

    for (let userId of members) {
        if (userId.charAt(0) !== 'm') {
            continue;
        }

        let windowId = yield window.findByConversationId(userId, this.conversationId);

        if (!windowId && msg.id === 'MSG' && this.type === '1on1') {
            // The case where one of the 1on1 members has closed his window
            windowId = yield window.create(userId, this.conversationId);
        }

        if (!windowId) {
            log.warn(userId, 'Window doesn\'t exist, can\'t stream ntf:' + JSON.stringify(msg));
            return;
        }

        msg.windowId = parseInt(windowId);

        yield notification.broadcast(userId, msg, excludeSession);
    }
};

Conversation.prototype._insertMembers = function*(members) {
    assert(members);

    for (let userId of Object.keys(members)) {
        this.members[userId] = members[userId];
        yield redis.sadd(`conversationlist:${userId}`, this.conversationId);
    }

    yield redis.hmset(`conversationmembers:${this.conversationId}`, members);
};

Conversation.prototype._remove = function*() {
    yield redis.del(`conversation:${this.conversationId}`);
    yield redis.del(`conversationmsgs:${this.conversationId}`);
    yield this._removeAllMembers();

    let key;

    if (this.type === 'group') {
        key = 'group:' + this.network + ':' + this.name.toLowerCase();
    } else {
        let userIds = Object.keys(this.members);
        userIds = userIds.sort();
        key = '1on1:' + this.network + ':' + userIds[0] + ':' + userIds[1];
    }

    let removed = yield redis.hdel('index:conversation', key);

    if (removed !== 1) {
        log.warn(`Tried to remove index:conversation entry that doesn\'t exist, key: ${key}`);
    }
};

Conversation.prototype._removeAllMembers = function*() {
    let members = Object.keys(this.members);

    for (let userId of members) {
        yield redis.srem(`conversationlist:${userId}`, this.conversationId);
    }

    this.members = {};
    yield redis.del(`conversationmembers:${this.conversationId}`);
};

Conversation.prototype._removeConversationWindow = function*(userId) {
    if (userId.charAt(0) === 'm') {
        yield window.removeByConversationId(userId, this.conversationId);
    }
};

Conversation.prototype._setMember = function*(userId, role) {
    this.members[userId] = role;
    let newField = yield redis.hset(`conversationmembers:${this.conversationId}`, userId, role);

    if (newField) {
        yield redis.sadd(`conversationlist:${userId}`, this.conversationId);
    }

    return newField;
};

Conversation.prototype._scanForEmailNotifications = function*(message) {
    if (message.userId === 'iSERVER') {
        return;
    }

    let userIds = [];

    if (this.type === 'group') {
        let mentions = message.body.match(/(?:^| )@\S+(?=$| )/g);

        if (!mentions) {
            return;
        }

        for (let mention of mentions) {
            let userId = yield nick.getUserIdFromNick(mention.substring(1), this.network);

            if (userId) {
                userIds.push(userId);
            }
        }

        if (userIds.length === 0) {
            return;
        }
    } else {
        userIds = [ yield this.getPeerUserId(message.userId) ];
    }

    for (let userId of userIds) {
        let user = yield redis.hgetall(`user:${userId}`);

        if (!user || parseInt(user.lastlogout) === 0) {
            continue; // Mentioned user is IRC user or online
        }

        let windowId = yield window.findByConversationId(userId, this.conversationId);

        if (!windowId) {
            continue; // Mentioned user is not on this group
        }

        let emailAlertSetting = yield redis.hget(`window:${userId}:${windowId}`, 'emailAlert');

        if (emailAlertSetting === 'true') {
            let nickName = yield nick.getCurrentNick(message.userId, this.network);
            let name = (yield redis.hget(`user:${message.userId}`, 'name')) || nickName;
            let notificationId = uuid(20);

            // TBD: Needs to be transaction, add lua script
            yield redis.sadd('emailnotifications', userId);
            yield redis.lpush(`emailnotificationslist:${userId}`, notificationId);

            yield redis.hmset(`emailnotification:${notificationId}`, {
                type: this.type,
                senderName: name,
                senderNick: nickName,
                groupName: this.name,
                message: message.body
            });
        }
    }
};

function *create(options) {
    let conversationId = yield redis.incr('nextGlobalConversationId');

    Object.keys(options).forEach(function(prop) {
        // Can't store null to redis
        options[prop] = options[prop] === null ? '' : options[prop];
    });

    yield redis.hmset(`conversation:${conversationId}`, options);

    if (options.type === 'group') {
        // Update group index
        yield redis.hset('index:conversation',
            'group:' + options.network + ':' + options.name.toLowerCase(), conversationId);
    }

    log.info('Created ' + options.type + ' conversation: ' + conversationId +
        (options.name ? ', name: ' + options.name : '') + ' (' + options.network + ')');

    return new Conversation(conversationId, options, {});
}

function *get(conversationId) {
    let record = yield redis.hgetall(`conversation:${conversationId}`);
    let members = yield redis.hgetall(`conversationmembers:${conversationId}`);

    if (record) {
        return new Conversation(conversationId, record, members || {});
    } else {
        log.warn(`Searched non-existing conversation, id: ${conversationId}`);
        return null;
    }
}
