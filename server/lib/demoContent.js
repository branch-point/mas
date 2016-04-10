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

const faker = require('faker'),
      redis = require('./redis').createClient(),
      log = require('./log'),
      conf = require('./conf'),
      masWindow = require('../services/windows'),
      conversationFactory = require('../models/conversation');

exports.enable = function() {
    setInterval(async function() {
        let demoUserEmail = conf.get('frontend:demo_user_email');
        let demoUserId = await redis.hget('index:user', demoUserEmail);
        let sentenceLength = Math.floor((Math.random() * 30 ) + 1);

        if (!demoUserId) {
            log.error('Demo user doesn\'t exist.');
            return;
        }

        let windowId = await redis.srandmember(`windowlist:${demoUserId}`);

        if (windowId) {
            // User has at least one window
            let conversationId = await masWindow.getConversationId(demoUserId, windowId);
            let conversation = await conversationFactory.get(conversationId);
            let url = '';

            if (!(Math.floor(Math.random() * 10 ))) {
                let randomImgFileName = Math.floor(Math.random() * 1000000);
                url = 'http://placeimg.com/640/480/nature/' + randomImgFileName + '.jpg';
            }

            await conversation.addMessage({
                body: faker.lorem.sentence(sentenceLength) + ' ' + url,
                userId: 'mDEMO',
                cat: 'msg'
            });
        }
    }, 2000);
};
