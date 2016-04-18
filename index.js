var http = require('http');
var https = require('https');
var url = require('url');

var credentials = require('./lib/credentials');
var dockerRequest = require('./lib/docker-request');

// Incoming requests look like /:userName/:clusterName/<remote API endpoint>
var server = http.createServer((req, res, next) => {
  var userInfo = {};
  var incomingURL = url.parse(req.url);

  console.log('[%s] %s %s', new Date(), req.method, req.url);

  userInfo.username = incomingURL.pathname.match(/^\/(.+?)\//)[1];
  userInfo.cluster = incomingURL.pathname.match(/^\/.+?\/(.+?)\//)[1];
  userInfo.sessionId = req.headers['x-session-id'];

  var dockerPath = '/v1.22/' + incomingURL.pathname.match(/^\/.+?\/.+?\/(.+?)$/)[1];
  if (incomingURL.search) {
    dockerPath += incomingURL.search;
  }

  credentials.get(userInfo)
  .then((creds) => {
    creds.path = dockerPath;
    console.log('Proxying to https://%s:%s%s', creds.host, creds.port, creds.path);
    var request = https.request(creds, (dockerResponse) => {
      dockerResponse.pipe(res);
    });

    request.on('error', (err) => {
      throw err;
    });

    request.end();
  })
  .catch((err) => {
    console.log(err.stack);
    res.end();
  });
});

server.listen(8080, () => {
  console.log('Server listening on port %s...', 8080);
});
