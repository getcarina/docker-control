var logger = require('../logging');
var WebSocket = require('ws');

module.exports = {
  sendMessage: function (socket, message) {
    if (socket.readyState !== WebSocket.OPEN) {
      logger.warn('Trying to send message to non-open WebSocket.');
      return;
    }

    socket.send(JSON.stringify(message));
  },
  readFrame: function (frameBuffer) {
    var frame = {
      stream: '',
      data: ''
    };

    // the first 4 bytes of a Docker stream are {STREAM_TYPE, 0, 0, 0}
    // STREAM_TYPE will be 0, 1, or 2.

    if ([0,1,2].indexOf(frameBuffer[0]) === -1) {
      // Doesn't look like a stream frame. Just toString() the whole thing and bail out.

      frame.stream = null;
      frame.data = frameBuffer.toString();

      return frame;
    }

    switch(frameBuffer[0]) {
      case 0:
        frame.stream = 'stdin';
      break;
      case 1:
        frame.stream = 'stdout';
      break;
      case 2:
        frame.stream = 'stderr';
      break;
    }

    frame.data = frameBuffer.toString('utf8', 8);

    return frame;
  }
};
