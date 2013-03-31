/*jshint node:true*/
'use strict';

console.log('Requiring stuff...');

var path = require('path');
var http = require('http');
var url = require('url');
var nodeStatic = require('node-static');
var WebSocketServer = require('ws').Server;

console.log('Starting up...');

var stream = process.stdin;
stream.setEncoding('utf8');
stream.resume();

var server = http.createServer(handler);

var staticDirectory = path.resolve(__dirname, '..', 'public');
var staticServer = new (nodeStatic.Server)(staticDirectory);
function handler(req, res) {
  var pathname = url.parse(req.url).pathname;
  console.log('Serving %s with %s',
      pathname, path.resolve(staticDirectory, pathname));

  req.on('end', serveStatic);

  function serveStatic() {
    staticServer.serve(req, res);
  }
}

var wss = new WebSocketServer({ server: server });
wss.on('connection', session);

function session(connection) {
  stream.on('data', onData);
  function onData(data) { connection.send(data); }
  
  connection.on('close', onClose);
  function onClose() {
    stream.removeListener('data', onData);
    console.log('WebSocket connection closed');
  }

  console.log('WebSocket connection open.');
}

var port = process.env.PORT || 8800;
server.listen(port);
console.log('Listening on port %s', port);

