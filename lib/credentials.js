const url = require('url');
const Q = require('q');
const request = require('request');
const unzip = require('unzip');

const logger = require('./logging');
const redis = require('./redis');
const controlPanelAPI = require('./control-panel-api');

const CREDENTIAL_KEY = 'users:clusterCredentials:{username}:{cluster}';
const CREDENTIAL_TTL = 3600;


// Check for credentials for this username/cluster in Redis. Returns a promise.
// the promise is resolved with the credentials if they exist, and rejected
// otherwise.
var _checkForStoredCredentials = (options) => {
  // format the Redis key name
  var key = CREDENTIAL_KEY
  .replace('{username}', options.username)
  .replace('{cluster}', options.cluster);

  logger.debug('Looking for stored credentials', {
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

var _getAndStoreCredentials = (options) => {
  return controlPanelAPI.getCredentialsURL(options)
  .then((credentialsURL) => {
    return _downloadAndParseCredentials(credentialsURL);
  })
  .then((credentials) => {
    options.credentials = credentials;

    return _storeCredentials(options);
  })
  .then(() => {
    return Q.resolve(options.credentials);
  });
};

var _downloadAndParseCredentials = (credentialsURL) => {
  var creds = {
    host: '',
    port: '',
    cert: '',
    key: '',
    ca: ''
  };

  return Q.Promise((resolve, reject) => {
    logger.debug('downloading credentials file');
    request({
      uri: credentialsURL,
    })
    .on('response', (res) => {
      if (res.statusCode >= 400) {
        return reject();
      }

      logger.debug('unzipping credentials file');
      res.pipe(unzip.Parse())
      .on('entry', function (entry) {
        // each "entry" is a file/folder in the ZIP bundle
        entry.on('data', function (data) {
          if (entry.path.match(/\/ca\.pem$/)) {
            creds.ca = data.toString();
          }

          if (entry.path.match(/\/cert\.pem$/)) {
            creds.cert = data.toString();
          }

          if (entry.path.match(/\/key\.pem$/)) {
            creds.key = data.toString();
          }

          if (entry.path.match(/\/docker\.env$/)) {
            var contents = data.toString();

            var swarmUrl = url.parse(contents.match(/DOCKER_HOST=(.+?)$/m)[1]);

            creds.host = swarmUrl.hostname;
            creds.port = swarmUrl.port;
          }

          // Drain the entry from memory
          entry.autodrain();
        });
      })
      .on('close', () => {
        return resolve(creds);
      })
      .on('error', function (error) {
        logger.error(error, {
          stack: error.stack
        });
        return reject(error);
      });
    });
  });
};

var _storeCredentials = (options) => {
  // format the Redis key name
  var key = CREDENTIAL_KEY
  .replace('{username}', options.username)
  .replace('{cluster}', options.cluster);

  Q.ninvoke(redis, 'set', key, JSON.stringify(options.credentials))
  .then(() => {
    return Q.ninvoke(redis, 'expire', key, CREDENTIAL_TTL);
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
    logger.debug('Getting credentials', {options: options});
    return Q.Promise((resolve, reject) => {
      // Try to use the session ID to get the user's name
      _getUsername(options)
      .then((username) => {
        options.username = username;


        return _checkForStoredCredentials(options)
        .then((credentials) => {
          logger.debug('Returning credentials from cache');
          resolve(credentials);
        })
        .catch(() => {
          logger.debug('No stored credentials found');
          // No credentials found, so we'll need to go get them.
          _getAndStoreCredentials(options)
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
