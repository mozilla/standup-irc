var _ = require('underscore');
var irc = require('irc');
var winston = require('winston');
var nomnom = require('nomnom');
var inireader = require('inireader');

var utils = require('./utils');
var api = require('./api');
var auth = require('./auth');

var options = nomnom.opts({
    config: {
        string: '-c CONFIG, --config=CONFIG',
        'default': 'config.ini',
        help: 'What config file to use. Default: config.ini.'
    }
}).parseArgs();

var optionsini = inireader.IniReader(options.config);

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
        nicks: []
    }
};

optionsini.load();
// Global config.
CONFIG = optionsini.getBlock();
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
// Global logger.
logger = new (winston.Logger)({
    transports: transports
});

// Global authentication manager
authman = new auth.AuthManager();

// This regex matches valid IRC nicks.
var NICK_RE = /[a-z_\-\[\]\\{}|`][a-z0-9_\-\[\]\\{}|`]*/;
var TARGET_MSG_RE = new RegExp('^(?:(' + NICK_RE.source + ')[:,]\\s*)?(.*)$');

/********** IRC Client **********/

// Global client
client = new irc.Client(CONFIG.irc.host, CONFIG.irc.nick, {
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
    var cond = msg.charAt(0) === '!';
    if (cond) {
        // msg = "!cmd arg1 arg2 arg3"
        var cmd_name = msg.split(' ')[0].slice(1);
        var args = msg.split(' ').slice(1);
        var cmd = commands[cmd_name] || commands['default'];
        cmd(user, channel, msg, args);
    } else {
        // Special case for botsnack
        if (msg.toLowerCase().trim() === 'botsnack') {
            commands.botsnack(user, channel, msg, []);
            return;
        }
        // If they didn't ask for a specific command, post a status.
        commands.status(user, channel, msg, [channel, msg]);
    }
});

client.on('notice', function(from, to, text) {
    if (from === undefined) {
        console.log('Service Notice: ' + text);
        from = '';
    }
    from = from.toLowerCase();
    if (from === 'nickserv') {
        authman.notice(from, text);
    }
});

var commands = {
    /* Simple presence check. */
    ping: function(user, channel, message, args) {
        client.say(channel, "Pong!");
    },

    /* Create a status. */
    status: function(user, channel, message, args) {
        utils.ifAuthorized(user, channel, function() {
            var project = args[0];
            if (project.charAt(0) == '#') {
                project = project.slice(1);
            }
            var ret = api.status.create(user, project, args.slice(1).join(' '));
            ret.on('ok', function(data) {
                client.say(channel, 'Ok, submitted status #' + data.id);
            });
            ret.on('error', function(err, data) {
                client.say(channel, 'Uh oh, something went wrong.');
            });
        });
    },

    /* Delete a status by id number. */
    'delete': function(user, channel, message, args) {
        utils.ifAuthorized(user, channel, function() {
            var ret = api.status.delete_(args[0], user);
            ret.on('ok', function(data) {
                client.say(channel, 'Ok, status #' + args + ' is no more!');
            });
            ret.on('error', function(code, data) {
                if (code === 403) {
                    client.say(channel, "You don't have permissiont to do that. " +
                                        "Do you own that status?");
                } else {
                    client.say(channel, "I'm a failure, I couldn't do it.");
                }
            });
        });
    },

    /* Every bot loves botsnacks. */
    'botsnack': function(user, channel, message, args) {
        var responses = [
            'Yummy!',
            'Thanks, ' + user + '!',
            'My favorite!',
            'Can I have another?',
            'Tasty!'
        ];
        var r = Math.floor(Math.random() * responses.length);
        client.say(channel, responses[r]);
    },

    /* Check a user's authorization status. */
    'trust': function(user, channel, message, args) {
        var a = authman.checkUser(args);
        a.on('authorized', function() {
            client.say(channel, 'I trust ' + args);
        });
        a.on('unauthorized', function() {
            client.say(channel, "I don't trust " + args);
        });
    },

    /* The default action. Return an error. */
    'default': function(user, channel, message) {
        client.say(channel, user + ": Wait, what?");
    }
};
