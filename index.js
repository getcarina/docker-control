var http = require('http');
var https = require('https');
var url = require('url');

var logger = require('./lib/logging');
var credentials = require('./lib/credentials');

// Incoming requests look like /:clusterName/<remote API endpoint>
var server = http.createServer((req, res, next) => {
  res.locals = {
    _canContinue: true,
    userInfo: {}
  };

  res.on('abort', (details) => {
    logger.warn('Aborting response', details);

    res.locals._canContinue = false;
    res.statusCode = details.statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.write(JSON.stringify(details.error || details.message));
    res.end();
  });

  var incomingURL = url.parse(req.url);

  logger.info({
    method: req.method,
    url: req.url
  });

  if (req.headers['x-session-id']) {
    res.locals.userInfo.sessionId = req.headers['x-session-id'];
  } else {
    res.emit('abort', {
      statusCode: 401,
      message: {
        error: 'No session token provided'
      }
    });

    return;
  }

  try {
    res.locals.userInfo.cluster = incomingURL.pathname.match(/^\/(.+?)\//)[1];
  } catch (e) {
    // If the URL doesn't include these path parts, we can’t proxy it anywhere
    res.emit('abort', {
      statusCode: 404,
      message: {
        error: 'username and clustername not included in URL'
      }
    });
    return;
  }

  try {
    res.locals.dockerPath = '/v1.22/' + incomingURL.pathname.match(/^\/.+?\/(.+?)$/)[1];
  } catch (e) {

    res.emit('abort', {
      statusCode: 404,
      message: {
        error: 'No Docker API path parts included in URL'
      }
    });
    return;
  }

  if (incomingURL.search) {
    res.locals.dockerPath += incomingURL.search;
  }

  credentials.get(res.locals.userInfo)
  .then((creds) => {
    creds.path = res.locals.dockerPath;
    creds.method = req.method;

    logger.info('Proxying: %s https://%s:%s%s', creds.method, creds.host, creds.port, creds.path);
    var request = https.request(creds, (dockerResponse) => {
      // Pipe the Docker API response to the client
      res.statusCode = dockerResponse.statusCode;
      for (var name in dockerResponse.headers) {
        if (dockerResponse.headers.hasOwnProperty(name)) {
          res.setHeader(name, dockerResponse.headers[name]);
        }
      }

      dockerResponse.on('end', (arg) => {
        logger.debug('Ending upstream response', arg);
      });

      dockerResponse.pipe(res);
    });

    request.on('error', (err) => {
      // This is a low-level upstream problem
      res.emit('abort', {
        statusCode: 502,
        error: err
      });
    });

    // Send off the upstream request
    request.end();
  })
  .catch((err) => {
    // Failed to get credentials somehow
    res.emit('abort', err);
  });
});

server.listen(8080, () => {
  logger.info('Server listening on port %s...', 8080);
});
