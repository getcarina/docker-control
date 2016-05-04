const url = require('url');
const Q = require('q');
const request = require('request');

const logger = require('./logging');
const redis = require('./redis');
const controlPanelAPI = require('./control-panel-api');

const VERSION_KEY = 'users:clusterVersions:{username}:{cluster}';
const VERSION_TTL = 3600;
const LOWEST_VERSION = '1.14';


// Check for version for this username/cluster in Redis. Returns a promise.
// the promise is resolved with the version if they exist, and rejected
// otherwise.
var _checkForStoredVersion = (options) => {
  // format the Redis key name
  var key = VERSION_KEY
  .replace('{username}', options.username)
  .replace('{cluster}', options.cluster);

  logger.debug('Looking for stored version', {
    key: key
  });

  return Q.ninvoke(redis, 'get', key)
  .then((value) => {
    // If the value is null (key doesn't exist), reject the promise
    if (value === null) {
      return Q.reject();
    }

    // Otherwise, resolve with the contents of the key
    return Q(JSON.parse(value));
  });
}

var _getAndStoreVersion = (options) => {
  return _fetchVersion(options)
  .then((version) => {
    options.version = version;

    return _storeVersion(options);
  })
  .then(() => {
    return Q.resolve(options.version);
  });
};

var _fetchVersion = (options) => {
  return Q.Promise((resolve, reject) => {
    logger.info('Fetching cluster version');
    request({
      method: 'GET',
      url: url.format({
        protocol: 'https:',
        hostname: options.creds.host,
        port: options.creds.port,
        pathname: '/v' + LOWEST_VERSION + '/version'
      }),
      cert: options.creds.cert,
      key: options.creds.key,
      ca: options.creds.ca
    }, (err, res, body) => {
      // In case of any errors, return the lowest supported version
      if (err || res.statusCode >= 400) {
        return resolve(LOWEST_VERSION);
      }

      try {
        body = JSON.parse(body);
      } catch (e) {
        logger.warn(
          'Unable to get cluster version, using lowest supported version instead.',
          {
            cluster: options.cluster
          }
        );
        return resolve(LOWEST_VERSION);
      }

      return resolve(body.ApiVersion || LOWEST_VERSION);
    });
  });
};

var _storeVersion = (options) => {
  // format the Redis key name
  var key = VERSION_KEY
  .replace('{username}', options.username)
  .replace('{cluster}', options.cluster);

  logger.info('Caching cluster version', {
    key: key,
    version: options.version
  });

  Q.ninvoke(redis, 'set', key, JSON.stringify(options.version))
  .then(() => {
    return Q.ninvoke(redis, 'expire', key, VERSION_TTL);
  });
};

var _getUsername = (options) => {
  return controlPanelAPI.getSession(options)
  .then((session) => {
    return Q.resolve(session.user.name);
  })
  .catch((err) => {
    throw err;
  });
}

module.exports = {
  get: (options) => {
    logger.debug('Getting version for cluster \'%s\'', options.cluster);
    return Q.Promise((resolve, reject) => {
      // Try to use the session ID to get the user's name
      _getUsername(options)
      .then((username) => {
        options.username = username;


        return _checkForStoredVersion(options)
        .then((version) => {
          logger.debug('Returning version from cache');
          resolve(version);
        })
        .catch(() => {
          logger.debug('No stored version found');
          // No version found, so we'll need to go get them.
          _getAndStoreVersion(options)
          .then((url) => {
            resolve(url);
          })
          .catch((err) => {
            reject(err);
          });
        });
      })
      .catch((err) => {
        logger.error('Unable to read session data', err);
        return reject(err);
      });
    });
  }
};
