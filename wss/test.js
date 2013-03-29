#!/usr/bin/env node

var uid = process.getuid();

if (uid !== 0) {
  console.error('Need to run as root!');
  process.exit(1);
}

process.on('SIGUSR1', onSignal);

var state = 0;
function onSignal() {
  console.log(++state);
}

process.stdin.resume();

