var https = require('https');
var WebSocket = require('ws');
var logger = require('../../logging');

var sendMessage = require('../util').sendMessage;
var readFrame = require('../util').readFrame;

/**
 * Handler for the "addSource" action
 *
 * @arg socket {WebSocket} The current WebSocket connections
 * @arg data {Object} The contents of the incoming 'data' object
 *
 * @desc Opens a stream of logs from the container specified in `data.container`.
 *       Whenever data is received from the Docker API (whenever a new log entry
 *       is posted), relays the message to the client. Each message has an 8-byte
 *       header that indicates the output stream (stdout, stderr) and the size
 *       of the frame. `readFrame()` is called on each upstream frame to extract
 *       this information. The HTTPS connection to the Docker API will stay open
 *       forever, consuming a socket and
 */
module.exports = (socket, data) => {
  if (!data.container) {
    logger.info('No container name provided, ignoring addSource request');
    return;
  }

  if (socket.locals.logs.streamExists(data.container)) {
    logger.info('Stream for %s already exists, ignoring addSource request', data.container);
    return;
  }

  var creds = socket.locals.credentials;

  // Form the URL to get the container logs
  var requestPath = '/v1.22/containers/' + data.container + '/logs?stdout=1&stderr=1&tail=40&follow=1';
  logger.info('Proxying: GET https://%s:%s%s', creds.host, creds.port, requestPath);

  // Add all the certificates required to authenticate with the Docker host
  var httpsRequest = https.request({
    method: 'GET',
    host: creds.host,
    port: creds.port,
    cert: creds.cert,
    key: creds.key,
    ca: creds.ca,
    path: requestPath
  }, (response) => {

    // If the status code is an error-looking one, grab one frame's worth of
    // data (the error message) and kill the response.
    if (response.statusCode >= 400) {

      response.on('data', (responseData) => {
        console.log(responseData);

        logger.warn({
          statusCode: response.statusCode,
          error: responseData.toString()
        });

        sendMessage(socket, {
          action: 'addSourceFailure',
          data: {
            error: responseData.toString()
          }
        });

        response.destroy();
      });

      return;
    }

    response.on('data', (responseData) => {
      // The response will emit this event many times, each time a log entry is
      // added.

      // Extract the header from the log entry and return a structured object
      // that's easier to interact with
      var frame = readFrame(responseData);
      frame.container = data.container;

      // Send the log message to the client as a `logMessage` action
      sendMessage(socket, {
        action: 'logMessage',
        data: frame
      });
    });
  });

  // If some networking black magic happens, at the very least log it.
  httpsRequest.on('error', (err) => {
    logger.error(err);
  });

  // Send the request off upstream
  httpsRequest.end();

  // Add this stream to a shared location so it can be torn down when the client
  // disconnects.
  socket.locals.logs.addStream({
    container: data.container,
    request: httpsRequest
  });
}
