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
    ],
    spiDecode : {
      pinMap : {
        'mosi' : 'MOSI',
        'miso' : undefined,
        'ss'   : 'C̅S̅',
        'sclk' : 'SCK'
      },
      wordSize : 9
    }
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

    var a = document.getElementById('download');
    a.download = 'config.json'; // Chrome only (for now)
    a.href = 'data:application/json;' + JSON.stringify(config);
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

      var currentTick   = parseInt(columns.shift(), 10);
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
  
  var spiDecode = global.spiDecode = function () {
    var tsv = document.getElementById('tsv').value;
    var data = document.querySelector('#spi .data');
    data.innerHTML = '';

    var pinMap = config.lines.reduce(function (map, line, index) {
      map[line.label] = index;
      return map;
    }, {});
    
    var ssBit   = 1 << config.lines[pinMap[config.spiDecode.pinMap.ss  ]].bit;
    var sclkBit = 1 << config.lines[pinMap[config.spiDecode.pinMap.sclk]].bit;
    // var misoBit = 1 << config.lines[pinMap[config.spiDecode.pinMap.miso]].bit;
    var mosiBit = 1 << config.lines[pinMap[config.spiDecode.pinMap.mosi]].bit;

    var wordSizeBits = config.spiDecode.wordSize;
    function binaryWord(currentWord, bitCount) {
      var word = [];
      if (bitCount !== 0) {
        var bit;
        for (bit = 1 << (bitCount - 1); bit; bit >>= 1) {
          word.push((currentWord & bit) ? '1' : '0');
        }
      }
      while (word.length < wordSizeBits) {
        word.unshift('-');
      }
      return word.join('');
    }

    var wordSizeNibbles = Math.floor((config.spiDecode.wordSize - 1) / 4) + 1;
    function hexWord(currentWord, bitCount) {
      var word = currentWord.toString(16).split('');
      while (word.length < bitCount / 4) {
        word.unshift('0');
      }
      while (word.length < wordSizeNibbles) {
        word.unshift('-');
      }
      return word.join('');
    }

    var previousPinout;
    var currentWord = 0;
    var bitCount = 0;
    var words = [];
    tsv.split('\n').forEach(function (line, lineNumber) {
      var edge = false;
      var columns = line.split('\t');
      if (columns.length !== 2) { return; }

      var currentTick   = parseInt(columns.shift(), 10);
      var currentPinout = parseInt(columns.shift(), 16);
      if (currentTick === 0) {
        previousPinout = currentPinout;
        return;
      }

      if ((currentPinout & ssBit) === 0 && (previousPinout & ssBit) !== 0) {
        // ssBit went low => start new word
        currentWord = 0;
        bitCount = 0;
      }

      if ((currentPinout & ssBit) === 0) {
        edge = (currentPinout & sclkBit) !== 0 && (previousPinout & sclkBit) === 0;
        if (edge) {
          // ascending edge
          currentWord <<= 1;
          if ((currentPinout & mosiBit) !== 0) currentWord |= 0x01;
          bitCount++;
        }
      }

      if ((currentPinout & ssBit) !== 0 && (previousPinout & ssBit) === 0) {
        // ssBit went high => print current word
        var bin = binaryWord(currentWord, bitCount);
        var hex = hexWord(currentWord, bitCount);

        if (edge) {
          bin = bin.substring(0, bin.length) + '?';
          hex = hex.substring(0, hex.length) + '?';
        }

        var word = bin + ' - ' + hex;

        if (bitCount !== config.spiDecode.wordSize) {
          word = '<span class="error">' + word + '</span>';
        }

        words.push(word);
      }

      previousPinout = currentPinout;
    });

    data.innerHTML = words.join('\n');
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
