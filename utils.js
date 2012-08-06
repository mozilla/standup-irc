var _ = require('underscore');
var http = require('http');
var events = require('events');


/* Find a user's canonical username based on `canonicalNicks`.
 *
 * If no configured user can be matched, return `ircNick` unmodified.
 */
this.canonicalUsername = function(ircNick, canonicalNicks) {
    var matches = [];
    _.each(canonicalNicks, function(user) {
        if (this.isPrefix(user, ircNick)) {
            matches.push(user);
        }
    });
    if (matches.length === 0) {
        return ircNick;
    }
    // Sort by length.
    matches.sort(function(a, b) {
        return b.length - a.length;
    });
    // Grab the longest.
    return matches[0];
};


// Check if `a` is a prefix of `b`.
this.isPrefix = function(a, b) {
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
};


this.request = function(path, method, data, emitter) {
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
        res.on('end', function() {
            if (res.statusCode === 200) {
                var json = JSON.parse(resp_data);
                emitter.emit('ok', json);
            } else if (res.statusCode === 301) {
                this.request(res.headers.Location, method, data, emitter);
            } else {
                emitter.emit('error', res.statusCode, resp_data);
            }
        });
    });
    req.end(body);
    req.on('error', function(e) {
        emitter.emit('error', String(e));
    });

    return emitter;
}
