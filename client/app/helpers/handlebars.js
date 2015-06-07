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

/* global moment */

import Ember from 'ember';

let SafeString = Ember.Handlebars.SafeString;

Ember.Handlebars.helper('timeSince', function(online, timeStamp) {
    let res;

    if (online) {
        res = '';
    } else if (timeStamp === -1) {
        res = 'never';
    } else {
        res = moment.unix(timeStamp).fromNow(true);
    }

    return new SafeString(res);
});
