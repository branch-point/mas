#!/usr/bin/env node
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

require('./lib/init')('frontend');

let path = require('path'),
    koa = require('koa'),
    hbs = require('koa-hbs'),
    error = require('koa-error'),
    compress = require('koa-compress'),
    // logger = require('koa-logger'),
    co = require('co'),
    http = require('http'),
    handlebarsHelpers = require('./lib/handlebarsHelpers'),
    conf = require('./lib/conf'),
    log = require('./lib/log'),
    redisModule = require('./lib/redis'),
    passport = require('./lib/passport'),
    userSession = require('./lib/userSession'),
    routes = require('./routes/routes'),
    scheduler = require('./lib/scheduler'),
    demoContent = require('./lib/demoContent'),
    socketController = require('./controllers/socket');

let app = koa();

// Development only
if (app.env === 'development') {
    app.use(error());
    // app.use(logger());
}

// Enable GZIP compression
app.use(compress());

app.use(passport.initialize());

app.use(hbs.middleware({
    defaultLayout: 'layouts/main',
    viewPath: path.join(__dirname, 'views')
}));

app.use(userSession());

handlebarsHelpers.registerHelpers(hbs);
routes.register(app);

// This must come after last app.use()
let server = http.Server(app.callback());

socketController.setup(server);

co(function*() {
    let port = conf.get('frontend:port');

    yield redisModule.loadScripts();
    yield redisModule.initDB();

    scheduler.init();
    server.listen(port);

    log.info('MAS server started, http://localhost:' + port + '/');
})();

if (conf.get('frontend:demo_mode') === true) {
    demoContent.enable();
}
