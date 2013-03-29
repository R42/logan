var path = require('path');
var inpathSync = require('inpath').sync;
var sudoPath = inpathSync('sudo');

var path = require('path');
var executablePath = path.resolve('test.js');

var spawn = require('child_process').spawn;
var stdio = [ process.stdin, 'pipe', process.stderr];
var logan = spawn(sudoPath, [executablePath], { stdio: stdio });
logan.stdout.setEncoding('utf8');

var interval;
function requestData() { logan.kill('SIGUSR1'); }

process.on('SIGINT', onKill);
function onKill() {
  logan.kill();
  process.exit(0);
}

var http = require('http');
var url = require('url');
var server = http.createServer(handler);

var staticDirectory = path.resolve('..', 'public');
var staticServer = new (require('node-static').Server)(staticDirectory);
function handler(req, res) {
  req.on('end', serveStatic);

  function serveStatic() {
    staticServer.serve(req, res);
  }
}

var WebSocketServer = require('ws').Server
var wss = new WebSocketServer({ server: server });
wss.on('connection', session);

function session(connection) {
  logan.stdout.on('data', onData);
  connection.on('close', onClose);

  if (!interval)
    interval = setInterval(requestData, 1000);

  function onData(data) { connection.send(data); }
  
  function onClose() {
    logan.stdout.removeListener('data', onData);

    if (logan.stdout.listeners('data').length === 0) {
      clearInterval(interval);
      interval = undefined;
    }
  }
}

server.listen(8800);

