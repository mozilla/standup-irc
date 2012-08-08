var _ = require('underscore');
var http = require('http');
var events = require('events');


function request(path, method, data, emitter) {
    if (data === undefined) {
        data = {};
    }
    var body = JSON.stringify(data);
    var options = {
        host: CONFIG.standup.host,
        port: CONFIG.standup.port,
        path: path,
        method: method,
        headers: {
            'content-type': 'application/json',
            'content-length': body.length
        }
    };

    if (emitter === undefined) {
        emitter = new events.EventEmitter();
    }
    // Make the request
    var req = http.request(options, function(res) {
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
                emitter.emit('error', res.statusCode, resp_data);
            }
        });
    });
    req.end(body);
    req.once('error', function(e) {
        logger.error(options.host + ':' + options.port + options.path +
                     ': ' + JSON.stringify(data));
        emitter.emit('error', String(e));
    });

    return emitter;
}
this.request = request;


this.ifAuthorized = function(user, channel, func) {
    var a = authman.checkUser(user);
    a.once('authorized', func);
    a.once('unauthorized', function() {
        client.say(channel, "I don't trust you, " + user + ", " +
                            "are you identified with nickserv?");
    });
    return a;
};
