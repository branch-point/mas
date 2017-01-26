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

const User = require('../models/user');
const Session = require('../models/session');

exports.auth = function *auth(next) {
    this.mas = this.mas || {};
    this.mas.user = null;

    const cookieValue = this.cookies.get('session');

    if (!cookieValue) {
        yield next;
        return;
    }

    try {
        const cookie = JSON.parse(new Buffer(cookieValue, 'base64').toString('ascii'));

        if (cookie.userId && cookie.token) {
            const authSession = yield Session.findFirst({
                userId: cookie.userId,
                token: cookie.token
            });

            if (authSession && !authSession.expired) {
                const user = yield User.fetch(cookie.userId);

                if (user) {
                    this.mas.user = user;
                }
            }
        }
    } catch (e) {
        this.cookies.set('session'); // Delete the invalid cookie
        this.response.redirect('/');
        return;
    }

    yield next;
};
