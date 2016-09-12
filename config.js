var fs = require('fs');
var path = require('path');

var _ = require('lodash');

var existsSync = fs.existsSync || path.existsSync;


// Default configs
var defaults = {
    irc: {
        nick: 'standup'
    },
    standup: {
        port: 80,
        website: 'NOSITE',
        help_page: 'NOHELP'
    },
    log: {
        console: true,
        file: null
    },
    pg: {
        enabled: false
    },
    blacklist: []
};


// Load config from config.json
var configFromFile = {};

if (existsSync('./config.json')) {
     configFromFile = require('./config.json');
}

// Load config from environment.
function tryJSON(val) {
  try {
    return JSON.parse(val);
  } catch (e) {
    return val;
  }
}

var configFromEnv = {};
var key, keys, lastKey;
var obj;

// Load config from the environment, allowing for dotted values like `x.y.z`.
for (key in process.env) {
  keys = key.split('.');
  obj = configFromEnv;
  lastKey = keys[keys.length - 1];
  // Look at the all but the last key.
  keys.slice(0, -1).forEach(function(keyPart) {
    if (!(keyPart in obj)) {
      obj[keyPart] = {};
    }
    obj = obj[keyPart];
  });

  // Set the last key
  obj[lastKey] = tryJSON(process.env[key]);
}

module.exports = _.merge({}, defaults, configFromFile, configFromEnv,
  function(mergeTo, mergeFrom) {
    if (_.isArray(mergeFrom)) {
      return mergeFrom;
    }
    // Fall through to default.
    return undefined;
  });
