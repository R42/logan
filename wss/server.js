var path = require('path');

var stream = process.stdin;
stream.setEncoding('utf8');
stream.resume();

var http = require('http');
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
  stream.on('data', onData);
  function onData(data) { connection.send(data); }
  
  connection.on('close', onClose);
  function onClose() { stream.removeListener('data', onData); }
}

server.listen(8800);

