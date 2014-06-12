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

Mas.CreateGroupModalController = Ember.ObjectController.extend({
    group: '',
    password: '',
    errorMsg: '',

    actions: {
        submit: function() {
            Mas.networkMgr.send({
                id: 'CREATE',
                name: this.get('group'),
                password: this.get('password')
            }, function(resp) {
                if (resp.status === 'ok') {
                    this.send('closeModal');
                } else {
                    this.set('errorMsg', resp.errorMsg);
                }
            }.bind(this));
        },

        close: function() {
            this.send('closeModal');
        }
    }
});
