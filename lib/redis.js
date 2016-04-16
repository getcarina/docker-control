var redis = require('redis');

var client = redis.createClient({
  host: process.env.REDIS_HOST
});

module.exports = client;
