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

const authOptions = require('../../lib/authOptions');

module.exports = function*() {
    const path = this.request.path;

    if (path === '/' || path === '/index.html') {
        if (this.mas.user) {
            this.redirect('/app');
        } else {
            yield this.render('index', {
                page: 'frontpage',
                title: 'Chat Service',
                auth: authOptions
            });
        }
    } else {
        const page = path.replace(/\/(.*)\.html/, '$1');

        yield this.render(page, {
            page: page,
            title: page
        });
    }
};
