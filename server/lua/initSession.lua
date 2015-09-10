--
--   Copyright 2014 Ilkka Oksanen <iao@iki.fi>
--
--   Licensed under the Apache License, Version 2.0 (the "License");
--   you may not use this file except in compliance with the License.
--   You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
--   Unless required by applicable law or agreed to in writing,
--   software distributed under the License is distributed on an "AS
--   IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
--   express or implied.  See the License for the specific language
--   governing permissions and limitations under the License.
--

-- Initialization of notification queue needs to be atomic operation (=Lua script)
-- for streaming to be reliable.

#include 'lib/introduceNewUserIds'

local userId = ARGV[1]
local sessionId = ARGV[2]
local maxBacklogLines = tonumber(ARGV[3])
local cachedUpto = tonumber(ARGV[4])
local ts = ARGV[5]

local outbox = 'outbox:' .. userId .. ':' .. sessionId

local function split(s, delimiter)
    local result = {}
    for match in (s..delimiter):gmatch('(.-)'..delimiter) do
        table.insert(result, match)
    end
    return result
end

-- Redis HGETALL doesn't return a real hash, fix it.
local hgetall = function (key)
  local bulk = redis.call('HGETALL', key)
    local result = {}
    local nextkey
    for i, v in ipairs(bulk) do
        if i % 2 == 1 then
            nextkey = v
        else
            result[nextkey] = v
        end
    end
    return result
end

local seenUserIds = {}

local function seenUser(userId)
    if userId then
        seenUserIds[userId] = true
    end
end

redis.call('ZADD', 'sessionlist:' .. userId, ts, sessionId)

-- Iterate through windows
local windowIds = redis.call('SMEMBERS', 'windowlist:' .. userId)
local allUsers = {}

for i = 1, #windowIds do
    local oneOnOneUserId = nil
    local windowId = windowIds[i]
    local window = hgetall('window:' .. userId .. ':' .. windowId)
    local conversationId = window.conversationId
    local conversation = hgetall('conversation:' .. conversationId)
    local role = redis.call('HGET', 'conversationmembers:' .. conversationId, userId)

    if conversation.type == '1on1' then
        local users = redis.call('HKEYS', 'conversationmembers:' .. conversationId)

        if users[1] == userId then
            oneOnOneUserId = users[2]
        else
            oneOnOneUserId = users[1]
        end
    end

    redis.call('LPUSH', outbox, cjson.encode({
        ['id'] = 'CREATE',
        ['windowId'] = tonumber(windowId),
        ['network'] = conversation.network,
        ['name'] = conversation.name,
        ['userId'] = oneOnOneUserId, -- added if the window is 1on1
        ['type'] = conversation.type,
        ['emailAlert'] = window.emailAlert == 'true',
        ['soundAlert'] = window.soundAlert == 'true',
        ['titleAlert'] = window.titleAlert == 'true',
        ['minimizedNamesList'] = window.minimizedNamesList == 'true',
        ['role'] = role,
        ['row'] = tonumber(window.row),
        ['column'] = tonumber(window.column),
        ['password'] = conversation.password,
        ['topic'] = conversation.topic,
        ['desktop'] = tonumber(window.desktop)
    }))

    local members = {}
    local ids = hgetall('conversationmembers:' .. conversationId)

    for windowUserId, role in pairs(ids) do
        seenUser(windowUserId)

        table.insert(members, {
            ['userId'] = windowUserId,
            ['role'] = role
        })
    end

    redis.call('LPUSH', outbox, cjson.encode({
        ['id'] = 'ADDMEMBERS',
        ['windowId'] = tonumber(windowId),
        ['reset'] = true,
        ['members'] = members
    }))

    local lines = redis.call('LRANGE', 'conversationmsgs:' .. conversationId, 0, -1)
    local firstBacklogMessage = #lines - maxBacklogLines

    for ii = #lines, 1, -1 do
        local message = cjson.decode(lines[ii])

        local newMsg = message.gid >= firstBacklogMessage and message.gid > cachedUpto
        local newEdit = message.status ~= nil and message.editTs >= cachedUpto

        if newMsg or newEdit then
            message.id = 'MSG'
            message.editTs = nil
            message.windowId = tonumber(windowId)

            redis.call('LPUSH', outbox, cjson.encode(message))
            seenUser(message.userId)
        end
    end
end

-- Prepend the USERS notification so client gets it first
local userIdList = {}

-- Always include info about the user itself
table.insert(userIdList, userId)

for k,v in pairs(seenUserIds) do
    table.insert(userIdList, k)
end

introduceNewUserIds(userId, sessionId, nil, false, userIdList)

redis.call('LPUSH', outbox, cjson.encode({
    ['id'] = 'INITDONE'
}))
