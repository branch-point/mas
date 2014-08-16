#!/usr/bin/env node --harmony
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

var co = require('co'),
    Q = require('q'),
    elasticsearch = require('elasticsearch'),
    argv = require('yargs').argv;

var client = new elasticsearch.Client({
    host: 'localhost:9200',
//    log: 'trace'
});

co(function *() {
    if (argv.deleteIndices) {
        yield Q.nsend(client.indices, 'delete', {
            index: '_all'
        });
    }

    for (var i = 0; i < 100; i++) {
        console.log('Setting index: ' + i);

        var ret = yield Q.nsend(client.indices, 'create', {
            index: 'messages-' + i
        });
    }

    var ret = yield Q.nsend(client.indices, 'putMapping', {
        index: '_all',
        type: 'messages',
        body: {
            properties: {
                ts: {
                    type: 'date'
                },
                body: {
                    type: 'string'
                },
                cat: {
                    type: 'string'
                },
                nick: {
                    type: 'string'
                },
                userId: {
                    type: 'long'
                },
                name: {
                    type: 'string'
                },
                type: {
                    type: 'string'
		},
                network: {
                    type: 'string'
                }
            }
        }
    });
})();

