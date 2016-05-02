var logger = require('../logging');

/**
 * Logs route handler
 */
module.exports = function (socket) {
  socket.locals.logs = require('./logs/streams');

  // handlers shall accept two arguments, `socket` and `data`
  // `socket` is the current WebSocket object
  // `data` is the data being passed in this particular message
  var actionHandlers = {
    addSource: require('./logs/add-source'),
    removeSource: require('./logs/remove-source')
  };

  socket.on('message', function (data) {
    if (!socket.locals.authIsValid) {
      return;
    }

    try {
      data = JSON.parse(data);
    } catch (e) {
      // Not much we can do if the incoming message isn't valid JSON, so just
      // ignore it.
      return;
    }

    if (data.action && typeof actionHandlers[data.action] === 'function') {
      try {
        actionHandlers[data.action].call(null, socket, data.data || {});
      } catch (e) {
        logger.error('Error while calling action handler', {
          error: e,
          stack: e.stack
        });
      }
    }
  });

  /**
   * The `close` event is fired when a WebSocket client disconnects. These
   * connections will typically have multiple open https requests with the
   * Docker host to stream logs, and those need to be closed as well to free up
   * their connections and stop trying to send data to a non-existent WebSocket.
   */
  socket.on('close', function () {
    logger.info('Closing logs socket');
    // Close up https connections this socket probably left open
    for (var streamId in socket.locals.logs.streams) {
      if (socket.locals.logs.streamExists(streamId)) {
        socket.locals.logs.removeStream({container: streamId});
      }
    }
  });
};
