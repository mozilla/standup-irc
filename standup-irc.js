var irc = require('irc');
var http = require('http');
var events = require('events');
var winston = require('winston');

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
        ircnick: 'standup'
    },
    standup: {
        port: 80
    },
    log: {
        console: true,
        file: null
    },
    users: {
        nicks: [],
    }
};

inireader.load();
var CONFIG = inireader.getBlock();
if (CONFIG.users && CONFIG.users.nicks !== undefined) {
    CONFIG.users.nicks = CONFIG.users.nicks.split(',');
}
if (CONFIG.irc && CONFIG.irc.channels !== undefined) {
    CONFIG.irc.channels = CONFIG.irc.channels.split(',');
}
CONFIG = _.extend({}, DEFAULTS, CONFIG);

var transports = [];
if (CONFIG.log.file) {
    transports.push(new (winston.transports.File)({
        filename: CONFIG.log.file
    }));
}
if (CONFIG.log.console) {
    transports.push(new (winston.transports.Console)());
}
var logger = new (winston.Logger)({
    transports: transports
});

// This regex matches valid IRC nicks.
var NICK_RE = /[a-z_\-\[\]\\^{}|`][a-z0-9_\-\[\]\\^{}|`]*/;
var TARGET_MSG_RE = new RegExp('^(?:(' + NICK_RE.source + ')[:,]\\s*)?(.*)$');

/********** IRC Client **********/

var client = new irc.Client(CONFIG.irc.host, CONFIG.irc.nick, {
    channels: CONFIG.irc.channels
});
client.on('connect', function() {
    logger.info('Connected to irc server.');
});

// Handle errors by dumping them to logging.
client.on('error', function(err) {
    // Error 421 comes up a lot on Mozilla servers, but isn't a problem.
    if (err.rawCommand !== '421') {
        return;
    }

    logger.error(err);
    if (err.hasOwnProperty('stack')) {
        logger.error(err.stack);
    }
});

/* Receive, parse, and handle messages from IRC.
 * - `user`: The nick of the user that send the message.
 * - `channel`: The channel the message was received in. Note, this might not be
 *   a real channel, because it could be a PM. But this function ignores
 *   those messages anyways.
 * - `msg`: The text of the message sent.
 */
client.on('message', function(user, channel, msg) {
    var target, match;

    match = TARGET_MSG_RE.exec(msg);
     // This shouldn't happen, but bail out if it does, just in case.
    if (!match) { return; }

    target = match[1];
    msg = match[2].trim();

    // Don't talk to myself, don't list to PMs, and only speak when spoken to.
    if (user === CONFIG.irc.nick || channel[0] !== '#' ||
            target !== CONFIG.irc.nick) {
        return;
    }

    var result = submitStatus(user, channel, msg);
    // Status was submitted correctly.
    result.on('ok', function(data) {
        client.say(channel, 'Ok, submitted status #' + data.id);
    });
    // There was a problem submitting the status.
    result.on('error', function(data) {
        client.say(channel, 'Uh oh, something went wrong.');
        logger.error('Problem adding status: ' + JSON.stringify(data));
    });
});

/* Submit a status message to the web service.
 * - `irc_handle`: The nick of the user that sent this status.
 * - `irc_channel`: The channel this status originated from.
 * - `content`: The text of the status.
 */
function submitStatus(irc_handle, irc_channel, content) {
    var body = JSON.stringify({
        user: canonicalUsername(irc_handle),
        project: irc_channel.substr(1),
        content: content,
        api_key: CONFIG.standup.api_key
    });
    var options = {
        host: CONFIG.standup.host,
        port: CONFIG.standup.port,
        path: '/api/v1/status/',
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'content-length': body.length
        }
    };
    logger.info(body);

    var emitter = new events.EventEmitter();
    // Make the request
    try {
        var req = http.request(options, function(res) {
            var resp_data = "";
            // Read data as it comes in
            res.on('data', function(chunk) {
                resp_data += chunk;
            });
            // When we have received the entire response
            res.on('end', function() {
                var json = JSON.parse(resp_data);
                if (res.statusCode === 200) {
                    emitter.emit('ok', json);
                } else {
                    emitter.emit('error', json);
                }
            });
        });
    } catch(e) {
        emitter.emit('error', String(e));
    }

    req.end(body);

    return emitter;
}

/* Find a user's canonical username based on `CONFIG.users`.
 *
 * If no configured user can be matched, return `username` unmodified.
 */
function canonicalUsername(irc_nick) {
    var matches = [];
    _.each(CONFIG.users.nicks, function(user) {
        if (isPrefix(user, irc_nick)) {
            matches.push(user);
        }
    });
    if (matches.length === 0) {
        return irc_nick;
    }
    // Sort by length.
    matches.sort(function(a, b) {
        return b.length - a.length;
    });
    // Grab the longest.
    return matches[0];
}

// Check if `a` is a prefix of `b`.
function isPrefix(a, b) {
    var i;
    if (a.length > b.length) {
        return false;
    }
    for (i = 0; i < a.length; i++) {
        if (a.charAt(i) !== b.charAt(i)) {
            return false;
        }
    }
    return true;
}
