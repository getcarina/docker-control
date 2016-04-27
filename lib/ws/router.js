var http = require('http');
var https = require('https');
var url = require('url');

var logger = require('../logging');
var authHandler = require('./auth');
var routeHandlers = {
  logs: require('./logs')
};

/**
 * Routes WebSocket connections to the appropriate handler function
 *
 * @arg socket {WebSocket} a new WebSocket connection.
 *
 */
module.exports = (socket) => {
  // The WebSocket server will handle requests to _any_ URL, and we'll do
  // different things depending on the original URL. It's like REST-meets-WebSockets.
  var incomingURL = url.parse(socket.upgradeReq.url);

  // We're stealing the idea of a `locals` object from Express to store state
  // that's specific to this WebSocket connection.
  socket.locals = {
    _canContinue: true,
    userInfo: {},
    authIsValid: false
  };

  // WebSockets don't have an `abort` event. We're adding this to abstract the
  // process of sending some error message and closing the connection.
  socket.on('abort', (details) => {
    logger.warn('Aborting WebSocket connection', details);
    socket.locals._canContinue = false;
    socket.send(JSON.stringify({
      error: details.error || details.message
    }), () => {
      socket.close();
    });
  });

  // We expect the original URL to look like /:clustername/:handler
  var urlMatches = incomingURL.path.match(/^\/(.+?)\/(.+?)\/?$/);

  try {
    socket.locals.userInfo.cluster = incomingURL.pathname.match(/^\/(.+?)\//)[1];
  } catch (e) {
    return socket.emit('abort', {
      message: 'clustername not included in original URL'
    });
  }

  try {
    socket.locals.socketPath = incomingURL.pathname.match(/^\/.+?\/(.+?)$/)[1];
  } catch (e) {
    return socket.emit('abort', {
      message: 'No route specified in original URL'
    });
  }

  if (typeof routeHandlers[socket.locals.socketPath] !== 'function') {
    return socket.emit('abort', {
      message: 'Invalid route specified in original URL'
    });
  }

  // Auth is a special case because it mutates the socket's state
  socket.on('message', function (message) {
    return authHandler(socket, message);
  });

  // Pass the socket on to the appropriate handler
  return routeHandlers[socket.locals.socketPath](socket);
}
