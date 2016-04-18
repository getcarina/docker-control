var winston = require('winston');

var Logger = new (winston.Logger)({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      colorize: true
    })
  ]
});

module.exports = Logger;
