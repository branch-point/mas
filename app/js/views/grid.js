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

Mas.GridView = Ember.View.extend({
    classNames: ['grid', 'flex-1'],

    didInsertElement: function() {
        $(window).on('resize', Ember.run.bind(this, function() {
            this.layoutWindows(false);
        }));
    },

    windowAdded: function() {
        Ember.run.next(this, function() { this.layoutWindows(false); });
    },

    layoutWindows: function() {
        // TBD: Add animation parameter
        // TBD: Consider to chain animations instead of stopping

        var PADDING = 5;
        var el = this.get('element');
        var containerWidth = this.$().width();
        var containerHeight = this.$().height();

        var windows = el.querySelectorAll('.window[data-visible="true"]');
        var rowNumbers = _.uniq(_.map(windows,
            function(element) { return element.getAttribute('data-row'); }));
        var rowHeight = (containerHeight - (rowNumbers.length + 1) * PADDING) / rowNumbers.length;

        _.forEach(rowNumbers, function(row, rowIndex) {
            var windowsInRow = el.querySelectorAll(
                '.window[data-row="' + row + '"][data-visible="true"]');
            var windowWidth = (containerWidth - windowsInRow.length * PADDING) / windowsInRow.length;

            _.forEach(windowsInRow, function(element, index) {
                $(element).velocity('stop').velocity({
                    left: index * windowWidth + (index + 1) * PADDING + 'px',
                    top : rowIndex * rowHeight + (rowIndex + 1) * PADDING + 'px',
                    width: windowWidth + 'px',
                    height : rowHeight + 'px'
                }, 400);
            });
        });
    }
});
