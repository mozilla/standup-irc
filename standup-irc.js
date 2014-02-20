var _ = require('underscore');
var fs = require('fs');
var irc = require('irc');
var path = require('path');
var pg = require('pg');
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
    },
    pg: {
        enabled: false
    },
    blacklist: []
};

var existsSync = fs.existsSync || path.existsSync;

// Global config.
if (existsSync('./config.json')) {
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

/********** PG Client **********/

// Check if PG is enabled and if so connect
if (config.pg.enabled) {
    var pg = require('pg');

    // If no connection string is provided in config then check for an ENV
    // variable with one.
    if (!config.pg.connstring) {
        config.pg.connstring = process.env.DATABASE_URL;
    }

    if (config.pg.connstring) {
        var pg_client = new pg.Client(config.pg.connstring);
        pg_client.connect();
    }

    if (pg_client) {
        var query = pg_client.query("SELECT id FROM blacklist");

        query.on('row', function(row) {
            config.blacklist.push(row.id);
        });
    }
}

/********** IRC Client **********/

// Global client
irc_client = new irc.Client(config.irc.host, config.irc.nick, {
    channels: config.irc.channels,
    port: config.irc.port,
    secure: config.irc.ssl
});

// Global authentication manager
authman = new auth.AuthManager();

// Connected to IRC server
irc_client.on('registered', function(message) {
    logger.info('Connected to IRC server.');

    // Store the nickname assigned by the server
    config.irc.realNick = message.args[0];
    logger.info('Using nickname: ' + config.irc.realNick);

});

// Wait for message of the day and decide whether we want to register our nick.
irc_client.addListener('motd', function (motd) {
    logger.info('Seen MOTD');
    if (config.irc.password) {
        logger.info('Identifying with Nickserv');
        irc_client.say('nickserv', 'identify ' + config.irc.password);
    }

    // Check for additional channels and join
    if (pg_client) {
        var query = pg_client.query("SELECT id FROM channels");

        query.on('row', function(row) {
            irc_client.join(row.id);
        });

        var query = pg_client.query("SELECT channel, name, value FROM channel_settings");

        query.on('row', function(row) {
            utils.channelSetting(row.channel, row.name, row.value);
        });
    }
});

// Handle errors by dumping them to logging.
irc_client.on('error', function(error) {
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
irc_client.on('invite', function(channel, from) {
    logger.info('Invited to ' + channel + ' by ' + from + '.');
    commands.goto.func(from, channel, '', [channel]);
});

/* The bot gets kicked out of a channel
 * - `channel`: The channel that the user is getting kicked from.
 * - `user`: The nick of the user getting kicked from.
 * - `by`: The nick of the kicker.
 */
irc_client.on('kick', function(channel, user, by) {
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
irc_client.on('message', function(user, channel, message) {
    var match, nick, targetMessageRegex;

    if (config.blacklist.indexOf(user) !== -1) {
        return false;
    }

    nick = utils.escapeRegExp(config.irc.realNick);
    targetMessageRegex = new RegExp('^' + nick + '[:,]\\s*?(.*)$');

    match = targetMessageRegex.exec(message);

    if (match) {
        message = match[1].trim();
        utils.respond(message, user, channel, commands);
    }
});

// Read server notices
irc_client.on('notice', function(from, to, text) {
    if (from === undefined) {
        logger.info('Service Notice: ' + text);
        from = '';
    }

    from = from.toLowerCase();

    if (from === 'nickserv') {
        authman.notice(from, text);
    }
});

// React to private messages
irc_client.on('pm', function(user, message) {
    utils.respond(message, user, user, commands);
});

// React to users quitting the IRC server
irc_client.on('quit', function(user) {
    if (user == config.irc.nick) {
        irc_client.send('NICK', config.irc.nick);
    }
});

// Update bot's perception of its own nick, if it changes
// (likely triggered by ping timeout of the intended nick, see above)
irc_client.on('nick', function(oldnick, newnick, channels, message) {
    if (oldnick == config.irc.realNick) {
        config.irc.realNick = newnick;
    }
});

var commands = {
    /* Post a message in all channels */
    'announce': {
        help: "Broadcast a message in all other channels.",
        usage: "<message>",
        func: function(user, channel, message, args) {
            _.each(irc_client.chans, function(data, chan) {
                if (chan !== channel) {
                    irc_client.say(chan, args.join(' '));
                }
            });
        }
    },

    /* Blacklist a user to ignore their messages */
    'blacklist': {
        help: "Blacklist a user or show a list of blacklisted users.",
        usage: "[<user>]",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var nick = args[0];

                if (nick) {
                    if (config.blacklist.indexOf(nick) === -1) {
                        pg_client.query("INSERT INTO blacklist" +
                            "(id, blacklisted_by) values " +
                            "('" + nick + "', '" + user + "')");

                        config.blacklist.push(nick);

                        irc_client.action(channel, 'Ignores ' + nick);
                    }
                } else {
                    if (config.blacklist.length > 0) {
                        utils.talkback(channel, user, 'Blacklisted users:');
                        utils.talkback(channel, user, config.blacklist.join(', '));
                    } else {
                        utils.talkback(channel, user, 'No blacklisted users.');
                    }
                }
            });
        }
    },

    /* Every bot loves botsnacks. */
    'botsnack': {
        func: function(user, channel, message, args) {
            var replies = [
                'Yummy!',
                'Thanks, ' + user + '!',
                'My favorite!',
                'Can I have another?',
                'Tasty!'
            ];
            irc_client.say(channel, _.shuffle(replies)[0]);
        }
    },

    /* Leave the channel */
    'bye': {
        help: "Ask the bot to leave the channel.",
        func: function(user, channel) {
            irc_client.say(channel, 'Bye!');
            irc_client.part(channel);

            // Remove the channel from the db
            if (pg_client) {
                pg_client.query("DELETE FROM channels WHERE id=$1", [channel]);
            }
        }
    },

    /* List all channels */
    'chanlist': {
        help: "Get a list of channels that I am in.",
        func: function(user, channel) {
            utils.talkback(channel, user, "I'm currently in:");
            utils.talkback(channel, user, _.keys(irc_client.chans).sort().join(', '));
        }
    },

    /* Delete a status by id number. */
    'delete': {
        help: "Delete a status by id.",
        usage: "<id>",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var id = args[0];
                if (id[0] === '#') {
                    id = id.slice(1);
                }
                id = parseInt(id, 10);
                if (isNaN(id)) {
                    utils.talkback(channel, user, '"' + args[0] + '" ' +
                        'is not a valid status ID.');
                    return;
                }

                var response = api.status.delete(id, user);

                response.once('ok', function(data) {
                    utils.talkback(channel, user, 'Ok, status #' + id + ' is no more!');
                });

                response.once('error', function(code, data) {
                    data = JSON.parse(data);
                    if (code === 403) {
                        utils.talkback(channel, user, "You don't have permission " +
                            " to do that. Did you post that status?");
                    } else {
                        var error = "I'm a failure, I couldn't do it.";
                        if (data.error) {
                            error += ' The server said: "' + data.error + '"';
                        }
                        utils.talkback(channel, user, error);
                    }
                });
            });
        }
    },

    /* Tell the bot to join a channel */
    'goto': {
        help: 'Tell the bot to join a channel.reg   ',
        usage: '<channel>',
        func: function(user, channel, message, args) {
            var join = args[0];

            if (join[0] !== '#') {
                join = '#' + join;
            }

            if (join) {
                irc_client.join(join);
            }

            // Add channel to the db
            if (pg_client) {
                pg_client.query({
                    text: 'INSERT INTO channels(id, invited_by) values($1, $2)',
                    values: [join, user]
                });
            }
        }
    },

    /* Provide a help system.
     *
     * To give a command a help message, define a 'help' field in it's object.
     * If the help field is not present, the command will not be listed.
     * To give a comand an arguments list, define a 'usage' field in it's object.
     * If the usage field is not present, the command will not list a usage it's help message.
     */
    'help': {
        help: "This help message.",
        func: function(user, channel) {
            var command, help, usage;

            irc_client.say(user, 'Available commands:');

            _.each(_.keys(commands).sort(), function(command) {
                help = commands[command].help;
                usage = commands[command].usage;

                if (help !== undefined) {
                    var message = ['!' + command];

                    if (usage !== undefined) {
                        message.push(usage)
                    }

                    message.push('- ' + help);

                    irc_client.say(user, message.join(' '));
                }
            });
        }
    },

    /* Simple presence check. */
    'ping': {
        help: "A simple presence check.",
        usage: undefined,
        func: function(user, channel, message, args) {
            irc_client.say(channel, "Pong!");
        }
    },

    /* Comment on a status */
    're': {
        help: "Comment on a status",
        usage: "<id> <comment>",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var reply_to = args[0];

                if (reply_to[0] === '#') {
                    reply_to = reply_to.slice(1);
                }

                var response = api.status.create(user, null, args.slice(1).join(' '), reply_to);

                response.once('ok', function(data) {
                    utils.talkback(channel, user, 'Ok, commented on #' + reply_to + ' with #' + data.id);
                });

                response.once('error', function(err, data) {
                    utils.talkback(channel, user, 'Uh oh, something went wrong.');
                });
            });
        }
    },

    /* Create a status. */
    'status': {
        usage: "<project> status message",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var project = null;

                if (user !== channel) {
                    project = args[0];
                    if (project[0] === '#') {
                        project = project.slice(1);
                    }
                }

                var status = args.slice(1).join(' ');
                var response = api.status.create(user, project, status);

                response.once('ok', function(data) {
                    var msg;

                    var user_url = 'http://' + config.standup.host;
                    if (config.standup.port != 80) {
                        user_url += ':' + config.standup.port;
                    }
                    user_url += '/user/' + user;

                    if (Math.random() < 0.97) {
                        msg = 'Ok, submitted ';
                    } else {
                        msg = 'Okeeday, meesa submittin ';
                    }
                    msg += 'status #' + data.id + ' for ' + user_url;
                    utils.talkback(channel, user, msg);
                });

                response.once('error', function(err, data) {
                    utils.talkback(channel, user, 'Uh oh, something went wrong.');
                });
            });
        }
    },

    /* Get/set the channel talkback setting */
    'talkback': {
        help: "Per channel setting to determine if the bot should PM responses.",
        usage: "[<loud|quiet>]",
        func:  function(user, channel, message, args) {
            if (!args[0]) {
                var tb = utils.channelSetting(channel, 'talkback');
                var msg = 'Talkback is currently: ' + (tb ? tb : 'loud');
                irc_client.say(channel, msg);
            } else if ((args[0] === 'loud') || (args[0] === 'quiet')) {
                if (args[0] === 'loud') {
                    irc_client.say(channel, 'I will respond in the channel from now on.');
                } else {
                    irc_client.say(channel, 'I will only PM users now.');
                }

                utils.channelSetting(channel, 'talkback', args[0]);

                var query = pg_client.query({
                        text: "DELETE FROM channel_settings WHERE " +
                              "channel=$1 AND name='talkback'",
                        values: [channel]
                    });

                query.on('end', function() {
                    pg_client.query({
                            text: "INSERT INTO channel_settings(channel, " +
                                  "name, value) values($1, 'talkback', $2)",
                            values: [channel, args[0]]
                        });
                });
            } else {
                irc_client.say(channel, 'Does not compute!');
            }
        }
    },

    /* Check a user's authorization status. */
    'trust': {
        help: "Check a user's authorization status.",
        usage: "<user>",
        func: function(user, channel, message, args) {
            var a = authman.checkUser(args);
            a.once('authorization', function(trust) {
                if (trust) {
                    utils.talkback(channel, user, 'I trust ' + args);
                } else {
                    utils.talkback(channel, user, "I don't trust " + args);
                }
            });
        }
    },

    /* Update a user's settings */
    'update': {
        help: "Update the user's settings.",
        usage: "<name|email|github_handle> <value> [<user>]",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var what = args[0];
                var value = args[1];
                var who = args[2];


                if (!who) {
                    who = user;
                }

                if (what && value) {
                    var response = api.user.update(user, what, value, who);

                    response.once('ok', function(data) {
                        irc_client.action(channel, "updates some stuff!");
                    });

                    response.once('error', function(code, data) {
                        if (code === 403) {
                            irc_client.say(channel, "You don't have " +
                                "permission to do that.");
                        } else {
                            var error = "I'm a failure, I couldn't do it.";
                            if (data.error) {
                                error += ' The server said: "' + data.error + '"';
                            }
                            irc_client.say(channel, error);
                        }
                    });
                }
            });
        }
    },

    'mkteam': {
        help: "Create a new team.",
        usage: "<slug> [<name>]",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var slug = args[0];
                var name = args[1];

                if (slug) {
                    var response = api.team.create(slug, name);

                    response.once('ok', function(data) {
                        irc_client.say(channel, "Team created!");
                    });

                    response.once('error', function(code, data) {
                        var error = "I'm a failure, I couldn't do it.";
                        if (data.error) {
                            error += ' The server said: "' + data.error + '"';
                        }
                        irc_client.say(channel, error);
                    });
                }
            });
        }
    },

    'rmteam': {
        help: "Remove a team.",
        usage: "<slug>",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var slug = args[0];

                if (slug) {
                    var response = api.team.remove(slug);

                    response.once('ok', function(data) {
                        irc_client.say(channel, "Team was deleted.");
                    });

                    response.once('error', function(code, data) {
                        var error = "I'm a failure, I couldn't do it.";
                        if (data.error) {
                            error += ' The server said: "' + data.error + '"';
                        }
                        irc_client.say(channel, error);
                    });
                }
            });
        }
    },

    'jointeam': {
        help: "Join or add another user to a team.",
        usage: "<slug> [<user>]",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var slug = args[0];
                var who = args[1];

                if (!who) {
                    who = user;
                }

                if (slug) {
                    var response = api.team.add_member(slug, user);

                    response.once('ok', function(data) {
                        irc_client.say(channel, who + " joined the '" + "' team.");
                    });

                    response.once('error', function(code, data) {
                        var error = "I'm a failure, I couldn't do it.";
                        if (data.error) {
                            error += ' The server said: "' + data.error + '"';
                        }
                        irc_client.say(channel, error);
                    });
                }
            });
        }
    },

    'leaveteam': {
        help: "Leave or remove another user from a team.",
        usage: "<slug> [<user>]",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var slug = args[0];
                var who = args[1];

                if (!who) {
                    who = user;
                }

                if (slug) {
                    var response = api.team.remove_member(slug, user);

                    response.once('ok', function(data) {
                        irc_client.say(channel, who + " joined the '" + "' team.");
                    });

                    response.once('error', function(code, data) {
                        var error = "I'm a failure, I couldn't do it.";
                        if (data.error) {
                            error += ' The server said: "' + data.error + '"';
                        }
                        irc_client.say(channel, error);
                    });
                }
            });
        }
    },

    'whitelist': {
        help: "Whitelist a user.",
        usage: "<user>",
        func: function(user, channel, message, args) {
            utils.ifAuthorized(user, channel, function() {
                var nick = args[0];

                if (nick) {
                    config.blacklist = _.without(config.blacklist, nick);
                    pg_client.query("DELETE FROM blacklist WHERE id='" + nick + "'");
                    utils.talkback(channel, user, 'Will do!');
                }
            });
        }
    },

    /* The default action. Return an error. */
    'default': {
        func: function(user, channel, message) {
            logger.info('Invalid command: ' + message);
            irc_client.say(channel, user + ': Huh? Try !help.');
        }
    }
};
