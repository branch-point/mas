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

const path = require('path'),
      fs = require('fs'),
      winston = require('winston'),
      MasTransport = require('./winstonMasTransport'),
      init = require('./init'),
      conf = require('./conf');

require('colors');
require('winston-loggly');

let logger = null;

exports.info = function(userId, msg) {
    logEntry('info', userId, msg, function() {});
};

exports.warn = function(userId, msg) {
    logEntry('warn', userId, msg, function() {
        if (conf.get('common:dev_mode')) {
            init.shutdown();
        }
    });
};

exports.error = function(userId, msg) {
    logEntry('error', userId, msg, function() {
        init.shutdown();
    });
};

exports.quit = function() {
    if (logger) {
        logger.clear();
    }
};

function logEntry(type, userId, msg, callback) {
    let entry = {};

    if (logger === null) {
        logger = new (winston.Logger)({
            transports: configTransports()
        });
    }

    if (msg === undefined) {
        msg = userId;
    } else {
        entry.userId = userId;
    }

    logger.log(type, msg, entry, callback);
}

function configTransports() {
    let transports = [];

    if (conf.get('log:enabled')) {
        let logDirectory = path.normalize(conf.get('log:directory'));

        if (logDirectory.charAt(0) !== path.sep) {
            logDirectory = path.join(__dirname, '..', '..', logDirectory);
        }

        let fileName = path.join(logDirectory, process.title + '.log');

        if (!fs.existsSync(logDirectory)) {
            const msg = 'ERROR: '.red + `Log directory ${logDirectory} doesn\'t exist.`;
            console.error(msg); // eslint-disable-line no-console
            process.exit(1);
        }

        if (conf.get('log:clear_at_startup') && fs.existsSync(fileName)) {
            fs.unlinkSync(fileName);
        }

        let fileTransportOptions = {
            filename: fileName,
            colorize: false,
            handleExceptions: true
        };

        let fileTransport = conf.get('log:rotate_daily') ?
            new (winston.transports.DailyRotateFile)(fileTransportOptions) :
            new (winston.transports.File)(fileTransportOptions);

        transports.push(fileTransport);
    }

    let consoleTransport = new (MasTransport)({
        handleExceptions: true
    });

    transports.push(consoleTransport);

    if (conf.get('loggly:enabled')) {
        let logglyTransport = new (winston.transports.Loggly)({
            subdomain: conf.get('loggly:subdomain'),
            inputToken: conf.get('loggly:token'),
            json: true
        });

        transports.push(logglyTransport);
    }

    return transports;
}
