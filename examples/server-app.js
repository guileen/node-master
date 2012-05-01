var http = require('http')
  , redisClient = require('redis').createClient()
  ;


var app = module.exports = http.createServer(function(req, res) {
    if(req.url === '/redis') {
      redisClient.set('foo', 'bar', function(err, data){
          res.end(data);
      });
    } else {
      res.end('hello world')
    }
});

var numSockets = 0;
app.on('connection', function(socket){
    console.log('port %j new socket, current: %d', app.address(), ++numSockets);
    socket.on('close', function(){
        console.log('close socket, current: %d', --numSockets);
    })
})

if(!module.parent) {
  app.listen(3000);
}
