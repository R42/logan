/*jshint browser: true */
/*global d3 timeSeriesChart */
(function (global) {
  'use strict';

  var config = {
    lines : [
      { label: 'MOSI'  , bit: 23, theme: 'orange' }, // 10,
      { label: 'C̅S̅'    , bit: 17, theme: 'green'  }, //  8,
      { label: 'SCK'   , bit: 22, theme: 'blue'   }, // 11,
      { label: 'R̅E̅S̅E̅T̅' , bit: 27, theme: 'red'    }, // 25,
      { label: 'BUTTON', bit: 24, theme: 'gray'   }
    ]
  };

  var data, chart;

  function setup() {
    data = config.lines.map(function () { return []; });
    chart = new Array(data.length);

    var lines = document.getElementById('lines');
    lines.innerHTML = '';
    config.lines.forEach(function (line, i) {
      var p = document.createElement('p');
      p.id = 'line_' + i;
      p.className = line.theme;
      lines.appendChild(p);
    });
  }

  setup();

  function addSample(collection, time, pinout, bit) {
    collection.push([time, pinout & (1 << bit) ? 1 : 0]);
  }

  function irregularTimeBase () {
    return function irregularTick (time, previousSample, sample, callback) {
        callback(time - 1, time, previousSample, sample);
      };
  }

  function noTimeBase (sloped) {
    var transitionCounter = 0;
    return sloped ?
      function slopedNoTick (time, previousSample, sample, callback) {
        callback(transitionCounter++, transitionCounter++, previousSample, sample);
      } :
      function noTick (time, previousSample, sample, callback) {
        callback(transitionCounter, transitionCounter++, previousSample, sample);
      };
  }

  var update = global.update = function () {
    var tsv = document.getElementById('tsv').value;

    data.forEach(function (series) { series.length = 0; });

    var tickBase = document.getElementById('timebase').value === 'irregular' ?
      irregularTimeBase() :
      noTimeBase(document.getElementById('sloped').checked);

    var previousPinout;
    tsv.split('\n').forEach(function (line) {
      var columns = line.split('\t');
      if (columns.length !== 2) { return; }

      var currentTick   = columns.shift();
      var currentPinout = parseInt(columns.shift(), 16);
      if (currentTick === 0) {
        previousPinout = currentPinout;
        return;
      }

      tickBase(currentTick, previousPinout, currentPinout,
        function (previousTick, tick, previousPinout, currentPinout) {
          config.lines.forEach(function (line, i) {
            addSample(data[i], previousTick, previousPinout, line.bit);
            addSample(data[i], tick        , previousPinout, line.bit);
          });
        });

      previousPinout = currentPinout;
    });

    config.lines.forEach(function(c, i) {
      d3.select('#line_' + i)
          .datum(data[i])
        .call(chart[i] = timeSeriesChart()
          .x(function(d) { return d[0]; })
          .y(function(d) { return d[1]; }));
    });
  };

  var buffer = [];

  function handleMessage(m) {
    buffer.push(m);

    if (/\n# EOB\s+?$/.test(m)) {
      document.getElementById('tsv').value =
        buffer.join('').split('\n').filter(function (line) {
          return line.charAt(0) !== '#';
        }).join('\n');
      update();

      buffer.length = 0;
    }
  }

  if (window.location.protocol === 'http:' ||
      window.location.protocol === 'https:') {
    var address = window.location.protocol.replace(/^http/, 'ws') + '//' + window.location.host;
    var ws = new WebSocket(address);
    ws.onmessage = function (m) { handleMessage(m.data); };
  }
})(window);
