const url = require('url');
const Q = require('q');
const request = require('request');
const unzip = require('unzip');
const redis = require('./redis');

const CREDENTIAL_KEY = 'users:clusterCredentials:{username}:{cluster}';
const CREDENTIAL_TTL = 3600;

var _getCredentialsURL = (options) => {
  options = options || {};

  return Q.Promise((resolve, reject) => {
    var req = request({
      method: 'GET',
      uri: 'http://rcscontrolpanel_control-panel_1:8080/api/clusters/' + options.cluster + '/credentials',
      headers: {
        'X-Session-Id': options.sessionId
      }
    }, (err, res, body) => {
      if (err) {
        return reject(err);
      }

      body = JSON.parse(body);

      return resolve(body.zip_url);
    });
  });
}

// Check for credentials for this username/cluster in Redis. Returns a promise.
// the promise is resolved with the credentials if they exist, and rejected
// otherwise.
var _checkForStoredCredentials = (options) => {
  // format the Redis key name
  var key = CREDENTIAL_KEY
  .replace('{username}', options.username)
  .replace('{cluster}', options.cluster);

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
  return _getCredentialsURL(options)
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
    request({
      uri: credentialsURL,
    })
    .on('response', (res) => {
      if (res.statusCode >= 400) {
        return reject();
      }

      res.pipe(unzip.Parse())
      .on('entry', function (entry) {
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

          entry.autodrain();
        });
      })
      .on('close', () => {
        return resolve(creds);
      })
      .on('error', function (error) {
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

module.exports = {
  get: (options) => {
    return Q.Promise((resolve, reject) => {
      _checkForStoredCredentials(options)
      .then((credentials) => {
        resolve(credentials);
      })
      .catch(() => {
        // No credentials found, so we'll need to go get them.
        _getAndStoreCredentials(options)
        .then((url) => {
          resolve(url);
        })
        .catch((err) => {
          reject(err);
        });
      });
    });
  }
};
