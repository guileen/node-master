var fs = require('fs')
var child_process = require('child_process')
var INTERNAL_PREFIX = 'NODE_MASTER_'; // the message with `{cmd: 'NODE_*'}` will emit a 'internalMessage' event, not 'message' event
var isWorker = !!process.env.NODE_MASTER_WORKER_ID
var isMaster = !isWorker

function getFileWriteStream(path, callback) {
    if(path == 'ignore' || !path) return callback(null, 'ignore')
    try{
        var stream = fs.createWriteStream(path, {flags:'a'})
        stream.on('open', function() {
                callback(null, stream)
        })
    } catch(e) {
        callback(e)
    }
}

function getStdio(stdout, stderr, callback) {
    getFileWriteStream(stdout, function(err, stdout) {
            if(err) return callback(err)
            getFileWriteStream(stderr, function(err, stderr) {
                    callback(err, stdout, stderr)
            })
    })
}

exports.daemon = function(opt) {
    if(isMaster) {
        if(!opt.worker) {
            throw new Error('require opt.worker')
        }
        var stdout = opt.stdout || 'ignore'
        var stderr = opt.stderr || 'ignore'
        getStdio(opt.stdout, opt.stderr, function(err, stdout, stderr) {
                if(err) return console.log(err)
                var env = opt.env || process.env;
                var cwd = opt.cwd || process.cwd();

                env.NODE_MASTER_WORKER_ID = '1'

                var cp_opt = {
                    stdio: ['ignore', stdout, stderr],
                    env: env,
                    cwd: cwd,
                    detached: true
                }
                var cmd, argv
                if(typeof opt.worker == 'function') {
                    cmd = process.execPath
                    argv = process.argv.slice(1)
                    // TODO test
                    // argv.unshift(process.execArgv)
                } else if(Array.isArray(opt.worker)){
                    cmd = opt.worker[0]
                    argv = opt.worker.slice(1)
                } else if(typeof opt.worker == 'string') {
                    argv = opt.worker.split(/\s+/)
                    cmd = argv[0]
                    argv = argv.slice(1)
                }
                var child = child_process.spawn(process.execPath, argv , cp_opt)
                child.unref()
        })
    } else if(isWorker) {
        opt.worker()
    }
}
