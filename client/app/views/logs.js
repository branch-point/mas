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

/* globals moment */

import Ember from 'ember';
import TitleBuilder from '../helpers/title-builder';

let titleBuilder = TitleBuilder.create();

export default Ember.View.extend({
    classNames: [ 'flex-column', 'fullscreen', 'modal' ],

    socket: Ember.inject.service(),
    store: Ember.inject.service(),

    $dateInput: null,
    currentDate: null,
    conversations: null,
    selectedConversation: null,
    messages: null,

    selectedConversationLabel: function() {
        if (!this.get('conversations')) {
            return 'No conversations.';
        }

        let selected = 0;

        this.get('conversations').some(function(elem, index) {
            if (elem.conversationId === parseInt(this.get('selectedConversation'))) {
                selected = index;
                return true;
            }
        }.bind(this));

        return this.get('conversations')[selected].label;
    }.property('selectedConversation', 'conversations.@each'),

    selectedConversationChanged: function() {
        this._fetchData();
    }.observes('selectedConversation'),

    friendlyDate: function() {
        return moment(this.get('currentDate')).format('dddd, MMMM Do YYYY');
    }.property('currentDate'),

    actions: {
        nextDay: function() {
            this._seek(1);
        },

        previousDay: function() {
            this._seek(-1);
        }
    },

    init: function() {
        this._super();

        this.set('currentDate', new Date());

        this.messages = Ember.A([]);
        this.conversationLabels = Ember.A([ 'Loading…' ]);
    },

    didInsertElement: function() {
        this._fetchConversations();

        this.$dateInput = this.$('.logs-date');

        this.$dateInput.datepicker({
            autoclose: true,
            todayHighlight: true,
            weekStart: 1
        });

        this.$dateInput.datepicker().on('changeDate', function() {
            this.set('currentDate', this.$dateInput.datepicker('getDate'));
            this._fetchData();
        }.bind(this));
    },

    _seek: function(days) {
        let newDate = moment(this.get('currentDate')).add(days, 'd').toDate();

        this.set('currentDate', newDate);
        this.$dateInput.datepicker('update', newDate);

        this._fetchData();
    },

    _fetchData: function() {
        // Beginning and end of the selected day in unix time format
        let date = this.get('currentDate');
        let epochTsStart = moment(date).startOf('day').unix();
        let epochTsEnd = moment(date).endOf('day').unix();

        this.get('socket').send({
            id: 'GET_CONVERSATION_LOG',
            conversationId: this.get('selectedConversation'),
            start: epochTsStart,
            end: epochTsEnd
        }, function(resp) {
            let messages = this.get('messages');
            let container = this.get('container');
            messages.clear();

            resp.results.forEach(function(message) {
                let messageRecord = container.lookup('model:message').setProperties(message);
                messages.pushObject(messageRecord);
            }.bind(this));
        }.bind(this));
    },

    _fetchConversations: function() {
        this.get('socket').send({
            id: 'LIST_CONVERSATIONS'
        }, function(resp) {
            this.set('conversations', resp.conversations.map(function(elem) {
                return {
                    conversationId: elem.conversationId,
                    label: titleBuilder.build({
                        name: elem.name,
                        network: elem.network,
                        type: elem.type,
                        userId: elem.userId,
                        store: this.get('store')
                    })
                };
            }.bind(this)));

            this.set('selectedConversation', resp.conversations[0].conversationId);
            this._seek(0);
        }.bind(this));
    }
});
