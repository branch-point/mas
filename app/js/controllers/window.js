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

App.WindowController = Ember.ObjectController.extend({
    init: function() {
        // Sound notification
        this.set('sound', new Howl({
            urls: ['sounds/staple_gun.mp3', 'sounds/staple_gun.ogg'],
            volume: 0.5
        }));

        this._super();
    },

    actions: {
        moveRowUp: function() {
            this._seekRow(-1);
        },

        moveRowDown: function() {
            this._seekRow(1);
        },

        hide: function() {
            this.set('visible', false);
            this.set('timeHidden', Date.now());
            this.set('newMessagesCount', 0);
        },

        close: function() {
            App.networkMgr.send({
                id: 'CLOSE',
                windowId: this.get('windowId')
            });
        },

        sendMessage: function() {
            var text = this.get('newMessage');

            App.networkMgr.send({
                id: 'SEND',
                text: text,
                windowId: this.get('windowId')
            });
            this.set('newMessage', '');

            this.get('messages').pushObject(App.Message.create({
                body: text,
                cat: 'mymsg',
                nick: App.nicks[this.get('network')],
                ts: moment().unix()
            }));
        }
    },

    newMessageReceived: function() {
        this.incrementProperty('newMessagesCount');

        if (this.get('messages').length > 200) {
            this.get('messages').shiftObject();
        }

        if (document.hidden) {
            // Browser title notification
            titlenotifier.add();

            // Sound notification
            this.get('sound').play();
        }
    }.observes('messages.@each'),

    isGroup: function() {
        return this.get('type') === 'group';
    }.property('type'),

    _seekRow: function(direction) {
        var newRow = this.get('parentController').nextRow(this.get('model'), direction);
        this.set('row', newRow);
        this.set('animate', true);
    }
});
