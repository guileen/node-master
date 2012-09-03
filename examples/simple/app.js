var http = require('http');

http.createServer(function(req, res) {
    res.end('OK');
}).listen(3000);
