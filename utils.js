var _ = require('lodash');
var http = require('http');
var https = require('https');
var events = require('events');
var url = require('url');

var config = require('./config');

// Channel settings
var channel_settings = {};

var request = function(path, method, data, emitter, unicode) {
    if (data === undefined) {
        data = {};
    }
    var body = exports.jsonStringifyUnicode(data, unicode);
    var urlinfo = url.parse(config.standup.url);
    var options = {
        host: urlinfo.hostname,
        port: urlinfo.port,
        protocol: urlinfo.protocol,
        path: path,
        method: method,
        headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'content-length': body.length
        }
    };
    var request = (options.protocol === 'https:' ? https : http).request;

    if (emitter === undefined) {
        emitter = new events.EventEmitter();
    }
    // Make the request
    var req = request(options, function(res) {
        var resp_data = "";
        // Read data as it comes in
        res.on('data', function(chunk) {
            resp_data += chunk;
        });
        // When we have received the entire response
        res.once('end', function() {
            if (res.statusCode === 200) {
                var json = JSON.parse(resp_data);
                emitter.emit('ok', json);
            } else if (res.statusCode === 301) {
                request(res.headers.location, method, data, emitter);
            } else {
                global.logger.error(options.host + ':' + options.port + options.path +
                             ': ' + res.statusCode + ' ' +
                             JSON.stringify(resp_data));
                emitter.emit('error', res.statusCode, resp_data);
            }
        });
    });
    req.end(body);
    req.once('error', function(e) {
        global.logger.error(options.host + ':' + options.port + options.path +
                     ': ' + JSON.stringify(data));
        emitter.emit('error', String(e));
    });

    return emitter;
};

exports.request = request;

var channelSetting = function(channel, name, value) {
    if (channel_settings[channel] === undefined) {
        channel_settings[channel] = {};
    }

    if (value === undefined) {
        return channel_settings[channel][name];
    } else {
        channel_settings[channel][name] = value;
    }
};

exports.channelSetting = channelSetting;

exports.ifAuthorized = function(user, channel, callback) {
    var a = global.authman.checkUser(user);

    a.once('authorization', function(trust) {
        if (trust) {
            callback();
        } else {
            global.irc_client.say(channel, "I don't trust you, " + user + ", " +
                                "are you identified with nickserv?");
        }
    });

    return a;
};

exports.escapeRegExp = function(str) {
    return str.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
};

/* Parse things like quotes strings from an argument list. */
exports.parseArgs = function(argList) {
    var args = [];
    var argBuilder = "";
    var quote = "";
    _.each(argList, function(arg) {
        if (argBuilder) {
            argBuilder += ' ' + arg;
            if (arg.slice(-1) === quote) {
                argBuilder = argBuilder.slice(0, -1);
                args.push(argBuilder);
                argBuilder = "";
                quote = "";
            }
        } else {
            if (arg[0] === "'") {
                quote = "'";
            } else if (arg[0] === '"') {
                quote = '"';
            }
            if (quote) {
                if (arg.slice(-1) === quote) {
                    args.push(arg.slice(1,-1));
                    quote = '';
                } else {
                    argBuilder = arg.slice(1);
                }
            } else {
                args.push(arg);
            }
        }
    });
    return args;
};

exports.respond = function(message, user, channel, commands) {
    if (message === '') {
        exports.talkback(channel, user, 'Whatcha talkin about, ' + user + '?');
    } else if (message[0] === '!') {
        // message = "!cmd arg1 arg2 arg3"
        var cmd_name = message.split(' ')[0].slice(1);
        var args = message.split(' ').slice(1);
        args = this.parseArgs(args);
        var cmd = commands[cmd_name] || commands['default'];
        cmd.func(user, channel, message, args);
    } else {
        if (message.toLowerCase() === 'botsnack') {
            // Special case for botsnack
            commands.botsnack.func(user, channel, message, []);
        } else {
            // If they didn't ask for a specific command, post a status.
            commands.status.func(user, channel, message, [channel, message]);
        }
    }
};

exports.talkback = function(channel, user, message) {
    if (channelSetting(channel, 'talkback') === 'quiet') {
       channel = user;
    }

    global.irc_client.say(channel, message);
};

exports.jsonStringifyUnicode = function(str, emitUnicode) {
    var json = JSON.stringify(str);
    if (!emitUnicode) {
        json = json.replace(/[\u007f-\uffff]/g, function(c) {
            return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);
        });
    }
    return json;
};
