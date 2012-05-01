var master = require('../master');

master(__dirname + '/bind-app.js')
  .cluster()
  .listen()
