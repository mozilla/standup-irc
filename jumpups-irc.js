var irc = require('irc');
var http = require('http');
var events = require('events');

var _ = require('underscore');
var options = require('nomnom').opts({
    config: {
        string: '-c CONFIG, --config=CONFIG',
        default: 'config.ini',
        help: 'What config file to use. Default: config.ini.'
    }
}).parseArgs();
var inireader = new require('inireader').IniReader(options.config);

// Default configs
var DEFAULTS = {
    irc: {
        ircnick: 'jumpups',
    },
    jumpups: {
        port: 80
    }
}

inireader.load();
var CONFIG = inireader.getBlock();
CONFIG = _.extend({}, DEFAULTS, CONFIG);

// This regex matches valid IRC nicks.
var NICKRE = /[a-z_\-\[\]\\^{}|`][a-z0-9_\-\[\]\\^{}|`]*/;

/********** IRC Client **********/

var client = new irc.Client(CONFIG.irc.host, CONFIG.irc.nick, {
    channels: CONFIG.irc.channels.split(','),
});
client.on('connect', function(err) {
    console.log('Connected.');
});

client.on('error', function(err) {
    // Error 421 comes up a lot on Mozilla servers, but isn't a problem.
    if (err.rawCommand != '421') {
        return;
    }

    console.log(err);
    if (err.hasOwnProperty('stack')) {
        console.log(err.stack);
    }
});

client.on('message', function(from, to, msg) {
    var target;

    // Don't talk to myself.
    if (from == CONFIG.irc.nick) {
        return;
    }
    // Ignore non-channel messages (like PMs)
    if (to[0] != '#') {
        return;
    }
    match = new RegExp('^(?:(' + NICKRE.source + ')[:,]\s*)?(.*)$').exec(msg);
    if (!match) {
        // I don't know how this would possible fail, but...
        return;
    }
    target = match[1];
    msg = match[2].trim();
    // Only do statuses when targeted at me.
    if (target != CONFIG.irc.nick) {
        return;
    }
    var result = submitStatus(from, to, msg);
    result.on('ok', function(data) {
        client.say(to, 'Ok, submitted status #' + data.id);
    });
    result.on('error', function(data) {
        client.say(to, 'Uh oh, something went wrong.');
        console.log(data);
    });
});

function submitStatus(irc_handle, irc_channel, content, callback) {
    var post_data = {
        irc_handle: irc_handle,
        irc_channel: irc_channel.substr(1),
        content: content,
        api_key: CONFIG.jumpups.api_key,
    };
    var body = JSON.stringify(post_data);
    var options = {
        host: CONFIG.jumpups.host,
        port: CONFIG.jumpups.port,
        path: '/status',
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'content-length': body.length
        }
    };

    var emitter = new events.EventEmitter();

    var req = http.request(options, function(res) {
        var resp_data = "";
        res.on('data', function(chunk) {
            resp_data += chunk;
        });
        res.on('end', function() {
            var json = JSON.parse(resp_data);
            if (res.statusCode == 200) {
                emitter.emit('ok', json);
            } else {
                emitter.emit('error', json);
            }
        });
    });

    req.write(JSON.stringify(post_data));
    req.end();

    return emitter;
}
