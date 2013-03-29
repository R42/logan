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

  function parseTime(str) {
    var ticks = parseInt(str, 10);
    return ticks;
  }

  function addSample(collection, time, pinout, bit) {
    collection.push([time, pinout & (1 << bit) ? 1 : 0]);
  }

  var update = global.update = function () {
    var tsv = document.getElementById('tsv').value;
    data[0].length = 0;
    data[1].length = 0;
    data[2].length = 0;
    data[3].length = 0;
    data[4].length = 0;
    var previousPinout;
    tsv.split('\n').forEach(function (line, idx) {
      var columns = line.split('\t');
      if (columns.length !== 2) { return; }

      var currentTime  = parseTime(columns.shift());
      var currentPinout  = parseInt(columns.shift(), 16);
      if (idx === 0) {
        previousPinout = currentPinout;
        return;
      }

      var previousTime = currentTime - 1;

      addSample(data[0], previousTime, previousPinout, LCD_MOSI  );
      addSample(data[1], previousTime, previousPinout, LCD_CS    );
      addSample(data[2], previousTime, previousPinout, LCD_SCK   );
      addSample(data[3], previousTime, previousPinout, LCD_RESET );
      addSample(data[4], previousTime, previousPinout, LCD_BUTTON);
      addSample(data[0], currentTime, currentPinout, LCD_MOSI  );
      addSample(data[1], currentTime, currentPinout, LCD_CS    );
      addSample(data[2], currentTime, currentPinout, LCD_SCK   );
      addSample(data[3], currentTime, currentPinout, LCD_RESET );
      addSample(data[4], currentTime, currentPinout, LCD_BUTTON);

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

  var address = window.location.protocol.replace(/^http/, 'ws') + '//' + window.location.host;
  var ws = new WebSocket(address);
  ws.onmessage = function (m) { handleMessage(m.data); };
})(window);
