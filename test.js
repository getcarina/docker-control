var credentials = require('./lib/credentials');
var dockerRequest = require('./lib/docker-request');

// This would be sent as a header
const SESSION = process.env.SESSION_ID;

// Use the session ID to download and unpack the credentials ZIP.
credentials.get({
  // We could get the username using their session ID, but that might imply a
  // strong dependency on the control panel's session store.
  // cluster name would be provided as a URL segment
  username: 'rcs-test-staging@mailinator.com',
  cluster: 'moar-containerz',
  sessionId: SESSION
})
.then((creds) => {
  // Once we have credentials we can pretty much do whatever we want.
  return dockerRequest.getContainers(creds);
})
.then((info) => {
  console.log(info);
  process.exit();
})
.catch((err) => {
  console.log(err);
});
