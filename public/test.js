
var address = window.location.protocol.replace(/^http/, 'ws') + '//' + window.location.host;
var ws = new WebSocket(address);
ws.onmessage = onmessage;

function onmessage(m) {
  console.log(m.data);
}

