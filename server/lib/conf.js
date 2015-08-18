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

const path = require('path'),
      assert = require('assert'),
      fs = require('fs'),
      nconf = require('nconf'),
      argv = require('yargs').argv,
      log = require('./log');

require('colors');

let configFileOption = argv.configFile;
let configFile;

if (configFileOption && configFileOption.charAt(0) === path.sep) {
    // Absolute path
    configFile = path.normalize(configFileOption);
} else {
    configFile = path.join(__dirname, '..', '..', configFileOption || 'mas.conf');
}

if (!fs.existsSync(configFile)) {
    console.error('ERROR: '.red + 'Config file ' + configFile + ' missing.');
    process.exit(1);
}

nconf.argv().add('file', {
    file: configFile,
    format: nconf.formats.ini
});

exports.get = function(key) {
    return get(key);
};

exports.getComputed = function(key) {
    let ret = '';
    let protocol;
    let port;

    switch(key) {
        case 'site_url':
            protocol = get('frontend:https') ? 'https' : 'http';
            port = get(`frontend:external_${protocol}_port`);

            port = port === 80 || port === 443 ? '' : `:${port}`;
            ret = `${protocol}://${get('site:domain')}${port}`;
            break;

        default:
            assert(0);
    }

    return ret;
};

function get(key) {
    let value = nconf.get(key);

    if (value === undefined) {
        log.error('Config variable missing in the config file: ' + key);
    }

    return value;
}
