var logger = require('../../logging');

/**
 * Handler for the "removeSource" action
 *
 * @arg socket {WebSocket} The current WebSocket connections
 * @arg data {Object} The contents of the incoming 'data' object
 *
 * @desc Closes the HTTPS connection associated with a given container's log
 *       stream. This has the effect of no longer sending logs for that
 *       container via the WebSocket
 *
 */
module.exports = (socket, data) => {
  if (!data.container) {
    logger.info('No container name provided, ignoring addSource request');
    return;
  }

  if (!socket.locals.logs.streamExists(data.container)) {
    logger.info('Stream for %s does not exist, ignoring removeSource request', data.container);
    return;
  }

  logger.info('Removing stream for container %s', data.container);
  socket.locals.logs.removeStream({container: data.container});
};
