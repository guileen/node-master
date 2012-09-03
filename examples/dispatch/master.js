var Master = require('../../master');

var num = 4;
var master = Master(__dirname + '/app.js', {
    num: num,
    autodispatch: false // auto dispatch, manully dispatch
})

var _id = 0;
master.on('connection', function(socket, server, serverKey, port, address){
    socket.on('data', function(data) {
        // we can get _id from data in real world.
        var id = _id ++ % num
        master.dispatch(master.workers[id], socket);
    });
});

master.on('message', function(worker, message, handle){
    master.dispatch(worker, handle);
});
