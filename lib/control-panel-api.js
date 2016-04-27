var Q = require('q');
var request = require('request');
var logger = require('./logging');

var _getCredentialsURL = (options) => {
  options = options || {};

  logger.debug('Getting credentials URL');
  return Q.Promise((resolve, reject) => {
    var req = request({
      method: 'GET',
      uri: process.env.CARINA_CP_URL + '/clusters/' + options.cluster + '/credentials',
      headers: {
        'X-Session-Id': options.sessionId
      }
    }, (err, res, body) => {
      if (err) {
        return reject(err);
      }

      // We can generally trust that the API will return valid JSON, but we
      // don't want an uncaught exception to trash the entire app if something
      // is amiss upstream.
      try {
        body = JSON.parse(body);
      } catch (e) {
        return reject(e);
      }

      return resolve(body.zip_url);
    });
  });
}

var _getSession = (options) => {
  options = options || {};

  logger.debug('Getting control panel session');
  return Q.Promise((resolve, reject) => {
    var req = request({
      method: 'GET',
      uri: process.env.CARINA_CP_URL + '/session',
      headers: {
        'X-Session-Id': options.sessionId
      }
    }, (err, res, body) => {
      if (err) {
        return reject(err);
      }

      // We can generally trust that the API will return valid JSON, but we
      // don't want an uncaught exception to trash the entire app if something
      // is amiss upstream.
      try {
        body = JSON.parse(body);
      } catch (e) {
        return reject(e);
      }

      if (res.statusCode >= 400) {
        logger.warn(body);
        return reject(body);
      }

      return resolve(body);
    });
  });
}

module.exports = {
  getSession: _getSession,
  getCredentialsURL: _getCredentialsURL
};
