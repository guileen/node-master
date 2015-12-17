var master = require('../../master2');

master.daemon({
        stdout: 'stdout.log',
        stderr: 'stdout.log',
        // cwd: process.cwd(),
        // env: process.env,
        // TODO replace supervisord
        // TODO autorestart: 1
        // TODO retry: 3
        worker: function() {
            console.log('run child process')
            setInterval(function() {
                    console.log('child log')
                    console.error('error log')
            }, 1000)
        }
})

/*
// node server.js status
master.on('command', function(command) {
        master.sendToMaster({})
        master.sendToChild({})
})

master.on('masterMessage', function() {
})

master.on('childMessage', function() {
})
*/
