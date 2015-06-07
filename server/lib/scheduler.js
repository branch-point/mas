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

const co = require('co'),
      CronJob = require('cron').CronJob,
      redis = require('./redis').createClient(),
      log = require('./log'),
      conf = require('./conf'),
      friends = require('../models/friends');

exports.init = function() {
    // Once in an hour
    new CronJob('0 0 */1 * * *', deleteStaleSessions, null, true); // eslint-disable-line no-new
    // Once in 15 minutes
    new CronJob('0 */15 * * * *', deliverEmails, null, true); // eslint-disable-line no-new
};

function deleteStaleSessions() {
    // Cleans stale sessions that might exist because of server crash

    log.info('Running deleteStaleSessions job');

    co(function*() {
        let ts = Math.round(Date.now() / 1000) - conf.get('session:idle_timeout');
        let list = yield redis.zrangebyscore('sessionlastheartbeat', '-inf', ts);

        for (let item of list) {
            let fields = item.split(':');
            let userId = fields[0];
            let sessionId = fields[1];

            let last = yield redis.run('deleteSession', userId, sessionId);
            log.info(userId, 'Removed stale session. SessionId: ' + sessionId);

            if (last) {
                yield friends.informStateChange(userId, 'logout');
            }
        }
    })();
}
