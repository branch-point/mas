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

/* globals URI, emojify */

import Ember from 'ember';

export default Ember.Object.extend({
    body: null,
    cat: null,
    ts: null,
    userId: null,
    type: null,
    window: null,
    nick: '',

    ircMotd: false,

    userIdDidChange: function() {
        let userId = this.get('userId');
        let network = this.get('window.network');

        if (userId && network) {
            this.set('nick', this.get('store.users').getNick(userId, network));
        }
    }.observes('userId', 'window').on('init'),

    decoratedBody: function() {
        let category = this.get('cat');
        let nick = this.get('nick');
        let body = this.get('body');
        let groupName = this.get('window.name');

        let output = '';

        if (category === 'join') {
            output = 'has joined ' + groupName + '.';
        } else if (category === 'part') {
            output = 'has left ' + groupName + '.' + body;
        } else if (category === 'quit') {
            output = 'has quit irc. Reason: ' + body;
        } else if (category === 'kick') {
            output = 'was kicked from ' + groupName + '. Reason: ' + body;
        }

        if (output === '') {
            output = this._decorate(this.get('body'));
        } else {
            output = '<span class="body">' + nick + ' ' + output + '</span>';
        }

        return output;
    }.property('body'),

    _decorate: function(text) {
        let textParts = [];
        let imgUrls = [];
        let pos = 0;
        let imgSuffixes = [ 'png', 'jpg', 'jpeg', 'gif' ];

        URI.withinString(text, function(url, start, end, source) {
            let urlObj = new URI(url);
            let visibleLink;

            if (start !== pos) {
                textParts.push(this._escHtml(source.substring(pos, start), false));
            }

            if (imgSuffixes.indexOf(urlObj.suffix()) !== -1) {
                imgUrls.push('<li><a href="' + this._escHtml(url, true) + '" class="user-img">' +
                    '<img src="/app/assets/images/spinner_96.gif" data-src="' +
                    this._escHtml(url, true) + '"></a></li>');
                visibleLink = this._escHtml(urlObj.filename(), false);
            } else {
                visibleLink = this._escHtml(urlObj.readable(), false);
            }

            textParts.push('<a href="' + this._escHtml(url, true) + '" target="_newtab">' +
                visibleLink + '</a>');
            pos = end;

            return url;
        }.bind(this));

        if (text && text.length !== pos) {
            textParts.push(this._escHtml(text.substring(pos), false));
        }

        let processedText = textParts.join('');

        // Legacy thumb up emoji
        processedText = processedText.replace('*thumb up*', ':thumbsup: ');

        // Other emojis
        processedText = emojify.replace(processedText);

        let imgSection = imgUrls.length ? '<ul class="user-image">' + imgUrls.join(' ') +
            '</ul>' : '';
        let textSection = '<span class="body">' + processedText + '</span>';

        return textSection + imgSection;
    },

    _escHtml: function(string, full) {
        let res = string.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        return full ? res.replace(/>/g, '&gt;').replace(/"/g, '&quot;') : res;
    }
});
