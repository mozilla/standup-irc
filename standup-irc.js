var _ = require('underscore');
var irc = require('irc');
var path = require('path');
var winston = require('winston');

var api = require('./api');
var auth = require('./auth');
var utils = require('./utils');

// Default configs
var defaults = {
    irc: {
        nick: 'standup'
    },
    standup: {
        port: 80
    },
    log: {
        console: true,
        file: null
    }
};

// Global config.
if (path.existsSync('./config.json')) {
    config = require('./config.json');
}

config = _.extend({}, defaults, config || {});

var transports = [];
if (config.log.file) {
    transports.push(new (winston.transports.File)({
        filename: config.log.file
    }));
}
if (config.log.console) {
    transports.push(new (winston.transports.Console)());
}
// Global logger.
logger = new (winston.Logger)({
    transports: transports
});

// Global authentication manager
authman = new auth.AuthManager();

// This regex matches valid IRC nicks.

/********** IRC Client **********/

// Global client
client = new irc.Client(config.irc.host, config.irc.nick, {
    channels: config.irc.channels
});

// Connected to IRC server
client.on('registered', function(message) {
    logger.info('Connected to IRC server.');

    // Store the nickname assigned by the server
    config.irc.realNick = message.args[0];
    logger.info('Using nickname: ' + config.irc.realNick);
});

// Handle errors by dumping them to logging.
client.on('error', function(error) {
    // Error 421 comes up a lot on Mozilla servers, but isn't a problem.
    if (error.rawCommand !== '421') {
        return;
    }

    logger.error(error);
    if (error.hasOwnProperty('stack')) {
        logger.error(error.stack);
    }
});

/* The bot gets invited to a channel by a user
 * - `channel`: The channel the bot is invited to.
 * - `from`: The nick of the user who invited the bot.
 */
client.on('invite', function(channel, from) {
    logger.info('Invited to ' + channel + ' by ' + from + '.');
    client.join(channel);
});

/* The bot gets kicked out of a channel
 * - `channel`: The channel that the user is getting kicked from.
 * - `user`: The nick of the user getting kicked from.
 * - `by`: The nick of the kicker.
 */
client.on('kick', function(channel, user, by) {
    if (user === config.irc.realNick) {
        logger.info('Kicked from ' + channel + ' by ' + by + '.');
        commands['bye'](user, channel);
    }
});

/* Receive, parse, and handle messages from IRC.
 * - `user`: The nick of the user that send the message.
 * - `channel`: The channel the message was received in. Note, this might not be
 *   a real channel, because it could be a PM. But this function ignores
 *   those messages anyways.
 * - `message`: The text of the message sent.
 */
client.on('message', function(user, channel, message) {
    var match, nick, targetMessageRegex;

    nick = utils.escapeRegExp(config.irc.realNick);
    targetMessageRegex = new RegExp('^' + nick + '[:,]\\s*?(.*)$');

    match = targetMessageRegex.exec(message);

    if (match) {
        message = match[1].trim();

        if (message[0] === '!') {
            // message = "!cmd arg1 arg2 arg3"
            var cmd_name = message.split(' ')[0].slice(1);
            var args = message.split(' ').slice(1);
            var cmd = commands[cmd_name] || commands['default'];
            cmd(user, channel, message, args);
        } else {
            if (message.toLowerCase() === 'botsnack') {
                // Special case for botsnack
                commands.botsnack(user, channel, message, []);
            } else {
                // If they didn't ask for a specific command, post a status.
                commands.status(user, channel, message, [channel, message]);
            }
        }
    }
});

// Read server notices
client.on('notice', function(from, to, text) {
    if (from === undefined) {
        logger.info('Service Notice: ' + text);
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
            if (project[0] === '#') {
                project = project.slice(1);
            }

            var status = args.slice(1).join(' ');
            var response = api.status.create(user, project, status);

            response.once('ok', function(data) {
                client.say(channel, 'Ok, submitted status #' + data.id);
            });

            response.once('error', function(err, data) {
                client.say(channel, 'Uh oh, something went wrong.');
            });
        });
    },

    /* Delete a status by id number. */
    'delete': function(user, channel, message, args) {
        utils.ifAuthorized(user, channel, function() {
            var id = args[0];
            if (id[0] === '#') {
                id = id.slice(1);
            }
            id = parseInt(id, 10);
            if (isNaN(id)) {
                client.say(channel, '"' + args[0] + '" ' +
                                    'is not a valid status ID.');
                return;
            }

            var response = api.status.delete(id, user);

            response.once('ok', function(data) {
                client.say(channel, 'Ok, status #' + id + ' is no more!');
            });

            response.once('error', function(code, data) {
                data = JSON.parse(data);
                if (code === 403) {
                    client.say(channel, "You don't have permission to do " +
                                        "that. Did you post that status?");
                } else {
                    var error = "I'm a failure, I couldn't do it.";
                    if (data.error) {
                        error += ' The server said: "' + data.error + '"';
                    }
                    client.say(channel, error);
                }
            });
        });
    },

    /* Every bot loves botsnacks. */
    'botsnack': function(user, channel, message, args) {
        var replies = [
            'Yummy!',
            'Thanks, ' + user + '!',
            'My favorite!',
            'Can I have another?',
            'Tasty!'
        ];
        client.say(channel, _.shuffle(replies)[0]);
    },

    /* Check a user's authorization status. */
    'trust': function(user, channel, message, args) {
        var a = authman.checkUser(args);
        a.once('authorization', function(trust) {
            if (trust) {
                client.say(channel, 'I trust ' + args);
            } else {
                client.say(channel, "I don't trust " + args);
            }
        });
    },

    'bye': function(user, channel) {
        client.say(channel, 'Bye!');
        client.part(channel);
    },

    'help': function(user, channel) {
        function say(message) {
            client.say(channel, message);
        }
        say('Available commands:');
        say('botsnack - Feed the bot!');
        say('!bye - Ask to leave the channel.');
        say('!delete <id> - Delete a previously posted status.');
        say("!update <name|email|github_handle> <value> [<user>] - Updates the user's setting.");
    },

    'update': function(user, channel, message, args) {
        utils.ifAuthorized(user, channel, function() {
            var what = args[0];
            var value = args[1];
            var who = args[2];


            if (who === undefined) {
                who = user;
            }

            if (what && value) {
                var response = api.user.update(user, what, value, who);

                response.once('ok', function(data) {
                    client.action(channel, "updates some stuff!");
                });

                response.once('error', function(code, data) {
                    if (code === 403) {
                        client.say(channel, "You don't have permission to do " +
                            "that.");
                    } else {
                        var error = "I'm a failure, I couldn't do it.";
                        if (data.error) {
                            error += ' The server said: "' + data.error + '"';
                        }
                        client.say(channel, error);
                    }
                });
            }
        });
    },

    /* The default action. Return an error. */
    'default': function(user, channel, message) {
        client.say(channel, user + ": Huh? Try !help.");
    }
};
