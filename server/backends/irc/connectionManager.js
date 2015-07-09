#!/usr/bin/env node
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

// Minimal connection manager that keeps TCP sockets alive even if
// rest of the system is restarted. Allows nondistruptive updates.

const net = require('net'),
      conf = require('../../lib/conf'),
      log = require('../../lib/log'),
      init = require('../../lib/init'),
      dropPriviledges = require('../../lib/dropPriviledges');

const IDENTD_PORT = 113;

let identHandler = function() {};
let worker;
let identServer;

// Start IDENT server
if (conf.get('irc:identd')) {
    identServer = net.createServer(identHandlerSelector);
    identServer.listen(IDENTD_PORT, identdDone);
} else {
    identdDone();
}

function identdDone() {
    dropPriviledges.drop();

    worker = require('./connectionManagerWorker');
    worker.init(setIdentdHandler);
}

function identHandlerSelector(conn) {
    identHandler(conn);
}

function setIdentdHandler(handler) {
    identHandler = handler;
}

init.on('beforeShutdown', function*() {
    if (conf.get('irc:identd')) {
        identServer.close();
    }

    yield worker.shutdown();
});

init.on('afterShutdown', function() {
    log.quit();
});
