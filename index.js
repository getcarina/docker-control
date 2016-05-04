var http = require('http');
var https = require('https');
var url = require('url');
var WebSocketServer = require('ws').Server;

var logger = require('./lib/logging');
var credentials = require('./lib/credentials');
var version = require('./lib/version');
var WebSocketRouter = require('./lib/ws/router');

// Incoming requests look like /:clusterName/<remote API endpoint>
var server = http.createServer((req, res) => {

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
    res.locals.dockerPath = '/v{ApiVersion}/' + incomingURL.pathname.match(/^\/.+?\/(.+?)$/)[1];
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
    res.locals.creds = creds;
    return version.get({
      sessionId: res.locals.userInfo.sessionId,
      cluster: res.locals.userInfo.cluster,
      creds: res.locals.creds
    });
  })
  .then((apiVersion) => {
    res.locals.version = apiVersion;

    res.locals.creds.path =
      res.locals.dockerPath.replace('{ApiVersion}', res.locals.version);
    res.locals.creds.method = req.method;

    logger.info(
      'Proxying: %s https://%s:%s%s',
      res.locals.creds.method,
      res.locals.creds.host,
      res.locals.creds.port,
      res.locals.creds.path
    );

    var request = https.request(res.locals.creds, (dockerResponse) => {
      // Pipe the Docker API response to the client
      res.statusCode = dockerResponse.statusCode;
      for (var name in dockerResponse.headers) {
        if (dockerResponse.headers.hasOwnProperty(name)) {
          res.setHeader(name, dockerResponse.headers[name]);
        }
      }

      dockerResponse.on('end', () => {
        logger.debug('Ending upstream response');
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

// In parallel with the REST proxy, we also listen for WebSocket connections to
// do things like stream logs or attach directly to running containers.
var wss = new WebSocketServer({
  server: server
});

wss.on('connection', WebSocketRouter);

server.listen(8080, () => {
  logger.info('Server listening on port %s...', 8080);
});
