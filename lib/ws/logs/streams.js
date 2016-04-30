var logger = require('../../logging');

module.exports = {
  /**
   * A dictionary to store currently open streams. Uses container names as key
   * names.
   *
   */
  streams: {},

  /**
   * Add a stream to the streams dictionary above.
   *
   * @param options {Object} options to identify this stream. Required properties
   * are `options.container` and `options.request`
   *
   */
  addStream: function (options) {
    var newStream = {
      container: options.container,
      request: options.request
    };

    if (!this.streams[options.container]) {
      logger.debug('Adding new stream', {
        container: newStream.container
      });

      this.streams[options.container] = newStream;
    }
  },

  /**
   * Tear down a stream and remove it from the dictionary above
   *
   * @param options {Object} options to identify the stream. Required property is
   * `options.container`
   *
   */
  removeStream: function (options) {
    try {
      logger.debug('Destroying open API response');
      this.streams[options.container].request.res.destroy();
    } catch (e) {
      logger.warn('Unable to destroy open API response.', {
        error: e,
        request: this.streams[options.container].request
      });
    }

    delete this.streams[options.container];
  },

  /**
   * Determines whether a given stream exists
   *
   * @param {String} streamName the name of the stream to look for
   * @return {Boolean} whether the stream exists
   */
  streamExists: function (streamName) {
    return (typeof this.streams[streamName] !== 'undefined');
  }
};
