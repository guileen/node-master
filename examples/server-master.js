var master = require('../master');

master(__dirname + '/server-app.js')
  .cluster()
  .listen('3001..3004')
