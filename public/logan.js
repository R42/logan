/*jshint browser: true */
/*global d3 timeSeriesChart */
(function (global) {
  'use strict';

  var data = [[], [], [], [], []];
  var chart = new Array(5);

  var LCD_CS     = 17;
  var LCD_SCK    = 22;
  var LCD_MOSI   = 23;
  var LCD_BUTTON = 24;
  var LCD_RESET  = 27;

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

    data[0].length = 0;
    data[1].length = 0;
    data[2].length = 0;
    data[3].length = 0;
    data[4].length = 0;

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
          addSample(data[0], previousTick, previousPinout, LCD_MOSI  );
          addSample(data[1], previousTick, previousPinout, LCD_CS    );
          addSample(data[2], previousTick, previousPinout, LCD_SCK   );
          addSample(data[3], previousTick, previousPinout, LCD_RESET );
          addSample(data[4], previousTick, previousPinout, LCD_BUTTON);
          addSample(data[0], tick, currentPinout, LCD_MOSI  );
          addSample(data[1], tick, currentPinout, LCD_CS    );
          addSample(data[2], tick, currentPinout, LCD_SCK   );
          addSample(data[3], tick, currentPinout, LCD_RESET );
          addSample(data[4], tick, currentPinout, LCD_BUTTON);
        });

      previousPinout = currentPinout;
    });

    ['mosi', 'cs', 'sck', 'reset', 'button'].forEach(function(c, i) {
      d3.select('#lcd_' + c)
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
