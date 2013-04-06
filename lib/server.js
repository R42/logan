/*jshint node:true*/
'use strict';

console.log('Requiring stuff...');

var path = require('path');
var http = require('http');
var url = require('url');
var nodeStatic = require('node-static');
var WebSocketServer = require('ws').Server;

var argv = require('optimist').
             usage('Use a Raspberry Pi as a Logical Analyzer.\nUsage: $0').
             alias('d', 'debug').
             alias('p', 'port').
             describe('d', 'Debug mode').
             describe('p', 'Web server port').
             boolean('debug').
             default({ debug: false,  port : 8800 }).
             argv;

console.log('Starting up...');

var stream = process.stdin;
stream.setEncoding('utf8');
stream.resume();

if (argv.debug) {
  console.log('Debug mode enabled.');
  stream.on('data', function dataLogger(data) {
    console.log(data);
  });
}

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
  function publishData(data) {
    connection.send(data);
  }

  function closeConnection() {
    stream.removeListener('data', publishData);
    console.log('WebSocket connection closed');
  }

  stream.on('data', publishData);
  connection.on('close', closeConnection);

  console.log('WebSocket connection open.');
}

server.listen(argv.port);
console.log('Listening on port %s', argv.port);
