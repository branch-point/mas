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

const crypto = require('crypto'),
      bcrypt = require('bcrypt'),
      co = require('co'),
      jwt = require('jwt-simple'),
      passport = require('koa-passport'),
      LocalStrategy = require('passport-local').Strategy,
      GoogleStrategy = require('passport-google-oauth').OAuth2Strategy,
      YahooStrategy = require('passport-yahoo').Strategy,
      CloudronStrategy = require('passport-cloudron'),
      redis = require('./redis').createClient(),
      user = require('../models/user'),
      conf = require('./conf'),
      log = require('./log');

exports.initialize = function() {
    setup();
    return passport.initialize();
};

exports.authenticate = function(type, cb) {
    return passport.authenticate(type, cb);
};

function setup() {
    if (conf.get('googleauth:enabled') === true) {
        let google = new GoogleStrategy({
            clientID: conf.get('googleauth:client_id'),
            clientSecret: conf.get('googleauth:client_secret'),
            callbackURL: conf.getComputed('site_url') + '/auth/google/oauth2callback'
        }, function(accessToken, refreshToken, params, profile, done) {
            // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
            let openIdId = jwt.decode(params.id_token, null, true).openid_id;
            authExt(openIdId, 'google:' + profile.id, profile, done);
        });

        passport.use(google);
    }

    if (conf.get('yahooauth:enabled') === true) {
        let yahoo = new YahooStrategy({
            returnURL: conf.getComputed('site_url') + '/auth/yahoo/callback',
            realm: conf.getComputed('site_url')
        }, function(openIdId, profile, done) {
            authExt(openIdId, null, profile, done);
        });

        passport.use(yahoo);
    }

    if (conf.get('cloudronauth:enabled') === true) {
        let cloudron = new CloudronStrategy({
            callbackURL: conf.getComputed('site_url') + '/auth/cloudron/callback'
        }, function (token, tokenSecret, profile, done) {
            authExt(profile.id, null, { displayName: profile.username, emails: [ { value: profile.email } ] } , done);
        });

        passport.use(cloudron);
    }

    let local = new LocalStrategy(authLocal);
    passport.use(local);
}

function authLocal(username, password, done) {
    co(function*() {
        let userRecord = null;
        let userId = null;
        let correctPassword = false;

        if (username) {
            userId = yield redis.hget('index:user', username.toLowerCase());
        }

        if (userId) {
            userRecord = yield redis.hgetall(`user:${userId}`);
        }

        if (userRecord && !userRecord.password && userRecord.extAuthId) {
            done('useExt', false);
            return;
        }

        if (!userRecord || userRecord.deleted === 'true' || !userRecord.password) {
            done('invalid', false);
            return;
        }

        let passwordParts = userRecord.password.split(':');
        let encryptionMethod = passwordParts[0];
        let encryptedHash = passwordParts[1];

        if (encryptionMethod === 'sha256') {
            let expectedSha = crypto.createHash('sha256').update(password, 'utf8').digest('hex');

            if (encryptedHash === expectedSha) {
                correctPassword = true;
                // Migrate to bcrypt
                let salt = bcrypt.genSaltSync(10);
                let hash = bcrypt.hashSync(password, salt);
                yield redis.hset(`user:${userId}`, 'password', 'bcrypt:' + hash);
            }
        } else if (encryptionMethod === 'bcrypt') {
            correctPassword = bcrypt.compareSync(password, encryptedHash);
        } else if (encryptionMethod === 'plain') {
            // Only used in testing
            correctPassword = password === encryptedHash;
            log.info('Login attempt with unencrypted password, result:' + correctPassword);
        }

        if (correctPassword && userRecord.inuse === 'true') {
            done(null, userId);
        } else {
            done('invalid', false);
        }
    })();
}

function authExt(openidId, oauthId, profile, done) {
    co(function*() {
        // Some old users are known by their google OpenID 2.0 identifier. Google is closing down
        // OpenID support so always convert in that case to OAuth 2.0 id.

        let userId = yield redis.hget('index:user', openidId);

        if (oauthId) {
            if (userId) {
                // User is identified by his OpenID 2.0 identifier even we know his OAuth 2.0 id.
                // Start to solely use OAuth 2.0 id.
                yield redis.hset(`user:${userId}`, 'extAuthId', oauthId);
                yield redis.hdel('index:user', openidId);
                yield redis.hset('index:user', oauthId, userId);
            } else {
                userId = yield redis.hget('index:user', oauthId);
            }
        }

        if (userId === null) {
            let newUser = user.create({
                name: profile.displayName,
                email: profile.emails[0].value,
                extAuthId: oauthId || openidId,
                inuse: 'false'
            }, {}, []);

            userId = yield newUser.generateUserId();
            yield newUser.save();
        }

        done(null, userId);
    })();
}
