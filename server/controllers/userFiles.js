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
      send = require('koa-send'),
      conf = require('../lib/conf');

const oneYearInSeconds = 60 * 60 * 24 * 365;
let dataDirectory = path.normalize(conf.get('files:upload_directory'));

// TBD: move this to library. Add exists check.
if (dataDirectory.charAt(0) !== path.sep) {
    dataDirectory = path.join(__dirname, '..', '..', dataDirectory);
}

module.exports = function*() {
    let file = this.params.file;
    let filePath = path.join(file.substring(0, 2), file);

    yield send(this, filePath, { root: dataDirectory });

    this.set('Cache-Control', 'public, max-age=' + oneYearInSeconds);
};
