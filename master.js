var fork = require('child_process').fork;
var net = require('net');
var Socket = net.Socket;
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var extend = util._extend; // node v0.8
var INTERNAL_PREFIX = 'NODE_MASTER_'; // the message with `{cmd: 'NODE_*'}` will emit a 'internalMessage' event, not 'message' event
var INTERNAL_ID = 'NODE_MASTER_UNIQUE_ID'

// Master is the entry, also the settings
// usage: new Master(filename, [options])
// filename: the worker file
// options: 
//   num      number of workers, default cpus
//   autodispatch     auto dispatch, default true
//   autorestart default true
//   ping     default -1  , ping interval
//   timeout  default 1000
//   exec     default process.argv[1]
//   execArgv default process.execArgv
//   args     default process.argv.slice(2)
//   silent   default false
//
// Events:
//   'listening' on server created.
//      args: server, serverKey, port, address
//   'connection'  on client connected.
//      args: socket, server, serverKey, port, address
//   'message'  on message send by worker
//      args: worker, msg, handle
//   'workerListening' on client listen on a server.
//      args: worker, server, serverKey, port, address
//   'timeout' on worker ping timeout.
//      args: worker
//
// simple usage with auto dispatch:
//     require('master')(__dirname + '/app.js');
//
// for a manually dispatch:
//     var Master = require('master');
//     var master = Master(__dirname + '/app.js', {autodispatch: false});
//
//     var i = 0;
//     master.on('connection', function(socket) {
//        master.dispatch(socket, master.workers[i++ % master.workers.length]);
//     });
//
//     master.on('timeout', function(worker) {
//        worker.restart();
//     });
//
//     master.on('message', function(worker, message, handle) {
//
//     });
//
//     // manually ping, you can also enable ping options
//     setInterval(function(){
//        worker.ping();
//     }, 100);
//
function Master(filename, options) {
  if(!(this instanceof Master)) { return new Master(filename, options); }
  EventEmitter.call(this);
  var master = this;
  this.isWorker = isWorker;
  this.isMaster = isMaster;
  this.workers = [];
  this.servers = {};
  this.listeningWorkers = {};
  this._ids = 0;
  this._connids = 0;
  // init options
  options = this.options = options || {};
  options.num = options.num || require('os').cpus().length;
  if(options.autodispatch === undefined) {
    options.autodispatch = true;
  }

  // Set settings object
  var settings = this.settings = {
    exec: options.exec || process.argv[1],
    execArgv: options.execArgv || process.execArgv,
    args: options.args || process.argv.slice(2),
    silent: options.silent || false
  };

  // start the program
  if(isMaster) {
    // if master start workers, listen message from workers
    for(var i = 0; i < options.num; i++) {
      this.workers.push(new Worker(this));
    }
    master.on('workerListening', function(worker, server, serverKey, port, address) {
        debug('workerListening');
        var serverKey = getServerKey(port, address);
        var listeningWorkers = master.listeningWorkers[serverKey] = master.listeningWorkers[serverKey] || [];
        listeningWorkers.push(worker);
    })

    if(options.autodispatch) {
      master.on('connection', function(socket, server, serverKey, port, address) {
          var listeningWorkers = master.listeningWorkers[serverKey];
          if(!listeningWorkers) throw new Error('there is no listening workers');
          master.dispatch(listeningWorkers[ this._connids ++ % listeningWorkers.length], socket, port, address);
      });
    }
  } else {
    // if workers, startup application.
    require(filename);
  }
}
util.inherits(Master, EventEmitter);

// dispatch a socket to worker
// master.dispatch(socket, worker, [serverKey])
// master.dispatch(socket, worker, [port], [address])
//   @socket the socket to dispatch
//   @worker the worker to dispatch
//   @port @address is use to identify the Server instance on the worker to handle the socket.
//     because if port is string, the serverKey is equal to port, and the serverKey is alwayse string,
//     so you can pass the serverKey to port directly.
Master.prototype.dispatch = function(worker, socket, port, address) {
  worker.process.send({cmd: INTERNAL_PREFIX + 'dispatch', port: port, address: address}, socket);
  // OLD way: see http://cnodejs.org/topic/4f16442ccae1f4aa27001081
  // send handle to worker process
  // see net.Socket, new Socket({handle: handle}), the handle is store as Socket._handle;
  // socket.pause();
  // worker.process.send({ cmd: INTERNAL_PREFIX + 'dispatch', port: port, address: address}, socket._handle);
  // TODO shall I close the connection after the worker has successfully dispatched?
  process.nextTick(function(){
      socket.destroy();
  })
}

// create master server, will emit 'connection' event to master
Master.prototype._createServer = function(port, address, allowHalfOpen) {
  var self = this;
  var serverKey = getServerKey(port, address);
  var server = this.servers[serverKey] = net.createServer({ allowHalfOpen: allowHalfOpen }, function(socket){
      debug('on connection');
      self.emit('connection', socket, server, serverKey, port, address);
  });
  server.listen(port, address, function(){
      self.emit('listening', server, serverKey, port, address);
  });
  return server;
}

// get master server by port and address
Master.prototype.getServer = function(port, address) {
  return this.servers[getServerKey(port, address)];
}

// Worker is the wrap of worker process
// events:
//   'listen' on worker listen at a port
//      args: server, serverKey, port, address
//   'message' on worker send message
//      args: msg, handle
//   'dispatched' on dispatched
function Worker(master) {
  if(!(this instanceof Worker)) { return new Worker(master); }
  EventEmitter.call(this);
  if(!master) {throw new Error('master')}
  var self = this;
  this.master = master;
  var settings = this.master.settings;
  var env = process.env;
  var envCopy = extend({}, env);
  envCopy[INTERNAL_ID] = this.id = this.master._ids ++;

  // fork worker
  var work_process = this.process = fork(settings.exec, settings.args, {
      'env': envCopy,
      'silent': settings.silent,
      'execArgv': settings.execArgv
  });

  // relay message and error
  this.process.on('message', this.emit.bind(this, 'message'));
  this.process.on('message', this.master.emit.bind(this.master, 'message', this));
  this.process.on('error', this.emit.bind(this, 'error'));
  

  // init child_process listeners
  work_process.on('internalMessage', function(msg, handle) {
      debug('on internalMessage');
      debug(msg);
      var cmd = msg && msg.cmd;
      if(cmd && cmd.indexOf(INTERNAL_PREFIX) === 0) {
        cmd = cmd.substring(INTERNAL_PREFIX.length);
        messageHandler[cmd](self, msg, handle);
      }
  })
}

util.inherits(Worker, EventEmitter);


function getServerKey(port, address) {
  if(typeof port == 'number') {
    // port, path, backlog
    return port + ':' + (address || '0.0.0.0');
  } else if(typeof port == 'string'){
    // sockpath
    return port;
  }
  // undefined - is handle
}

var messageHandler = {
  // =================================
  // send by master, receive by worker
  dispatch: function(msg, handle) {
    var workerServer;
    if(msg.port) {
      workerServer = getWorkerServer(msg.port, msg.address);
    } else {
      var keys = Object.keys(workerDummyServers);
      if(keys.length > 1) {
        throw new Error('more than one working server, you must specify the port and address to dispatch');
      }
      workerServer = workerDummyServers[keys[0]];
    }
    var isTCP = handle.constructor.name == 'TCP';
    var socket = handle;
    if(isTCP) {
      socket = new Socket({
          handle: handle,
          allowHalfOpen: workerServer.allowHalfOpen
      });
      socket.readable = socket.writable = true;
      socket.pause();
    }
    workerServer.emit('connection', socket);
    if(isTCP) socket.resume();
  },
  // =================================
  // send by worker, receive by master
  listen: function(worker, msg, handle){
    debug('listen');
    var args = msg.args
      , port = args[0]
      , address = args[1]
      , serverKey = getServerKey(port, address);
      ;
    if(!serverKey) return;
    var master = worker.master;
    var server = master.getServer(port, address) || master._createServer(port, address, msg.allowHalfOpen);
    worker.emit('listening', server, serverKey, port, address);
    master.emit('workerListening', worker, server, serverKey, port, address);
  },
  eject: function(worker, msg, handle) {
    var isTCP = handle.constructor.name == 'TCP';
    var socket = handle;
    if(isTCP) {
      socket = new Socket({
          handle: handle,
          allowHalfOpen: msg.allowHalfOpen
      });
      socket.readable = socket.writeable = true;
      socket.pause();
    }
    worker.emit('eject', socket, msg.port, msg.address);
    worker.master.emit('eject', worker, socket, msg.port, msg.address);
    if(isTCP) socket.resume();
  }
};

// Module exports
var exports = module.exports = Master;
// Define isWorker and isMaster
var isWorker = exports.isWorker = INTERNAL_ID in process.env;
var isMaster = exports.isMaster = ! isWorker;
var debug;
if (process.env.NODE_DEBUG && /master/.test(process.env.NODE_DEBUG)) {
  debug = function(x) {
    var prefix = process.pid + ',' +
        (isWorker ? 'Worker' : 'Master');
    console.error(prefix, x);
  };
} else {
  debug = function() { };
}

// eject a socket from current worker, give the master a chance to redispatch it.
exports.eject = function(socket, port, address) {
  if(isWorker) {
    process.send({cmd: INTERNAL_PREFIX + 'eject', port: port, address: address}, socket._handle);
  } else {
    throw new Error('not a worker');
  }
}

// below is the magic
var getWorkerServer;

if(isWorker) {
  // allow worker handle multi server, use to retrival Server instance after process send handle
  var workerDummyServers = {};
  var Server = net.Server;
  // worker Server adapter
  var rawListen = Server.prototype.listen;
  // rewrite worker server.listen
  Server.prototype.listen = function() {
    // the worker wont listen actually
    var args = Array.prototype.slice.call(arguments);
    debug('listening' + args)
    if(typeof args[args.length - 1] == 'function') {
      var callback = args.pop();
    }
    var serverKey = getServerKey(args[0], args[1]);
    if(!serverKey) {
      return rawListen.apply(this, arguments);
    }
    // store server instance, so you can retrival it by address
    workerDummyServers[serverKey] = this;
    debug('emit');
    process.send({cmd: INTERNAL_PREFIX + 'listen', args: args, allowHalfOpen: this.allowHalfOpen});
    if(callback) process.nextTick(callback);
  }

  getWorkerServer = function(port, address){
    return workerDummyServers[getServerKey(port, address)];
  }

  process.on('internalMessage', function(msg, handle) {
      debug(msg);
      var cmd = msg && msg.cmd;
      if(cmd && cmd.indexOf(INTERNAL_PREFIX) === 0) {
        cmd = cmd.substring(INTERNAL_PREFIX.length);
        messageHandler[cmd](msg, handle);
      }
  })

}

