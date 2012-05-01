var child_process = require('child_process')
  , cluster = require('cluster')
  ;

module.exports = function(appfile) {
  return new Master(appfile)
}

// config class
function Master(path) {
  var options = this.options = {
    path: path
  }
  this.childs = [];

  var self = this;

  var serverModule = {
    createServer : function(options){
      self.options.serverOptions = options;
      return self;
    }
  }

  this.__defineGetter__('http', function(){
      options.serverType = 'http';
      return serverModule;
  });

  this.__defineGetter__('https', function(){
      options.serverType = 'https';
      return serverModule;
  });

  this.__defineGetter__('net', function() {
      options.serverType = 'net';
      return serverModule;
  });
}

Master.prototype.cluster = function(n) {
  this.options.numCluster = n || require('os').cpus().length;
  return this;
}

Master.prototype.listen = function(str) {

  var ports = str ? stripToArray(str) : [null];

  // app is a server
  for(var i = 0; i < ports.length; i ++) {
    var port = ports[i];
    var child = new Child(this, port, this.options.numCluster);
    child.start();

    this.childs.push(child);
  }
}

function Child(master, port, numCluster) {
  this.port = port;
  this.master = master;
  this.numCluster = numCluster;
}

Child.prototype.start = function(){
  var child = this.process = child_process.fork(__filename);
  child.send({
      options: this.master.options
    , port: this.port
    , numCluster: this.numCluster
  });

  child.on('exit', function() {

  });

  child.on('message', function() {
      // recieve message from child
  })

}

Child.prototype.stop = function(){

}

Child.prototype.restart = function(){
  this.stop();
  this.start();
}

function stripToArray(str) {
  if(Array.isArray(str)) {
      return str;
  }
  if(!str) return;

  var match = str.match(/^(\d+)\.\.(\d+)$/);
  if(match) {
    var from = parseInt(match[1])
      , to = parseInt(match[2])
      , len = to - from + 1;
    var arr = new Array(len);
    for(var i = 0; i < len; i++) {
      arr[i] = from + i;
    }
    return arr;
  }

  match = str.match(/^(.*)\[(\d+)\.\.(\d+)\](.*)$/);
  if(match) {
    var from = parseInt(match[2])
      , to = parseInt(match[3])
      , len = to - from + 1;
    var arr = new Array(len);
    for(var i = 0; i < len; i++) {
      arr[i] = match[1] + (from + i) + match[4];
    }
    return arr;
  }

  return [str];
}

function startCluster(message) {

    var options = message.options
      , port = message.port
      , numCluster = message.numCluster
      ;

    if(cluster.isMaster) {

      for(var i = 0; i < numCluster; i++) {
        var worker = cluster.fork()
        worker.send(message);
      }
    } else {
      startServer(message);
    }
}

function startServer(message) {

    var options = message.options
      , port = message.port
      ;

    if(!options) return;

    var app = require(options.path)
    if(options.serverType) {
      var args = [app];
      if(options.serverOptions) {
        args.unshift(options.serverOptions)
      }
      var module = require(options.serverType);
      module.createServer.apply(module, args).listen(port);
      console.log('listen at %s', port);
    } else if(port){
      app.listen(port);
      console.log('listen at %s', port);
    }
}

// recieve message from parent
process.on('message', function(message) {
    // console.log('on message <%j>', message);

    if(message.numCluster && message.numCluster > 1) {
      startCluster(message);
    } else {
      startServer(message);
    }

})

function requestRestart() {
  process.send({
      cmd: 'restart_me'
  })
}
