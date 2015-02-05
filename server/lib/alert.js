//
//   Copyright 2015 Ilkka Oksanen <iao@iki.fi>
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

const outbox = require('../lib/outbox'),
      redis = require('../lib/redis').createClient();

exports.sendAlerts = function*(userId, sessionId) {
    let now = Math.round(Date.now() / 1000);
    let alertIds = yield redis.smembers(`activealerts:${userId}`);

    for (let i = 0; i < alertIds.length; i++) {
        let alert = yield redis.hgetall(`alert:${alertIds[i]}`);

        if (alert && now < alert.expires) {
            alert.id = 'ALERT';
            alert.alertId = alertIds[i];

            yield outbox.queue(userId, sessionId, alert);
        } else {
            // Alert has expired
            yield redis.srem(`activealerts:${userId}`, alertIds[i]);
        }
    }
};
