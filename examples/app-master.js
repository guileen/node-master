var master = require('../master');

master(__dirname + '/app-app.js')
  .http.createServer()
  .listen('3001..3004')
