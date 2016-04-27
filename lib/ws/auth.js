const logger = require('../logging');
const credentials = require('../credentials');

module.exports = (socket, data) => {
  try {
    data = JSON.parse(data);
  } catch (e) {
    // shhh
    return;
  }

  // Don't process again if this connection is already authenticated
  if(socket.locals.authIsValid) {
    return;
  }

  /**
   * Everything below here applies to connections that are not yet authenticated.
   */

  // Any action besides 'auth' is unavailable until authenticated
  if (data.action !== 'auth') {
    socket.emit('abort', {
      message: 'Not Authenticated.'
    });
    return;
  }

  credentials.get({
    sessionId: data.data.sessionId,
    cluster: socket.locals.userInfo.cluster
  })
  .then((credentials) => {
    socket.locals.credentials = credentials;
    socket.locals.authIsValid = true;
    return socket.send(JSON.stringify({
      action: 'authSuccess',
      data: {}
    }));
  })
  .catch((err) => {
    logger.error(err);
  });
};
