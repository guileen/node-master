var net = require('net');

var server = net.createServer();

var i = 0;
server.on('connection', function(socket) {

    var timer = setInterval(function(){
        socket.write('' + i++, 'utf8');
    }, 1000);

    socket.on('close', function(){
        clearInterval(timer);
    })

});

server.listen(4000);
