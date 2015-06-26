//
//   Copyright 2009-2015 Ilkka Oksanen <iao@iki.fi>
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

import Ember from 'ember';

export default Ember.Component.extend({
    classNames: [ 'flex-row', 'unconfirmed-email' ],

    socket: Ember.inject.service(),
    store: Ember.inject.service(),

    email: Ember.computed.alias('store.email'),
    emailConfirmed: Ember.computed.alias('store.emailConfirmed'),

    actions: {
        requestConfirmation() {
            let msg = 'Confirmation link sent. Check your spam folder if you don\'t see it in inbox.';

            this.get('socket').send({
                id: 'SEND_CONFIRM_EMAIL'
            }, function(resp) {
                this.get('store').upsertModel('alert', {
                    message: msg,
                    dismissible: true,
                    report: false,
                    postponeLabel: false,
                    ackLabel: 'Okay'
                });

                this.set('emailConfirmed', true);
            }.bind(this));
        },

        openModal(modal) {
            this.sendAction('openModal', modal);
        }
    },

    didRender() {
        $(window).trigger('resize');
    }
});
