node-master
=========

Daemon/Cluster helper

## install

```
npm install master --save
```

## Usage

```
var master = require('master')

master.daemon({
    stdout: '/path/to/out.log',
    stderr: '/path/to/out.log',
    worker: function() {
        http.createServer(function(req, res) {
            console.log(req.method, req.url)
            res.end('hello world')
        })
    }
})
```
