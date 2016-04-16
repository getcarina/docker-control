var https = require('https');
var url = require('url');
var Q = require('q');

// We'll need to figure out the right API version for the user's cluster
var _formRequest = (options) => {
  options.path = '/v1.22' + options.path;

  return options;
};

var _doRequest = (options) => {
  return Q.Promise((resolve, reject) => {
    var req = https.request(_formRequest(options), (res) => {
      res.on('data', (data) => {
        return resolve(
          JSON.parse(data.toString())
        );
      });
    });
    req.end();

    req.on('error', (err) => {
      return reject(err);
    });
  });
};

module.exports = {
  getInfo: (credentials) => {
    credentials.path = '/info';

    return _doRequest(credentials);
  },
  getContainers: (credentials) => {
    credentials.path = '/containers/json?all=1'
    return _doRequest(credentials);
  }
}
