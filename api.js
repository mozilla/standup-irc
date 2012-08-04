/* Functions to access the remote web api of a standup app. */
var http = require('http');
var events = require('events');

var utils = require('./utils');

exports.status = {
    /* Create a status message.
     * - `user`: The user that submitted the status.
     * - `project`: The project associated with the status.
     * - `content`: The text of the status.
     */
    create: function(user, project, content) {
        var body = JSON.stringify({
            user: utils.canonicalUsername(user),
            project: project,
            content: content,
            api_key: CONFIG.standup.api_key
        });
        var options = {
            host: CONFIG.standup.host,
            port: CONFIG.standup.port,
            path: '/api/v1/status',
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'content-length': body.length
            }
        };

        var emitter = new events.EventEmitter();
        // Make the request
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
        req.on('error', function(e) {
            emitter.emit('error', String(e));
        });
        req.end(body);

        return emitter;
    },

    /* Delete a status.
     * - `id`: The id of the status to delete.
     */
    delete_: function(id) {
        var options = {
            host: CONFIG.standup.host,
            port: CONFIG.standup.port,
            path: '/api/v1/status/' + id,
            method: 'DELETE',
            headers: {
                'content-type': 'application/json',
                'content-length': 0
            }
        };

        var emitter = new events.EventEmitter();
        // Make the request
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
        req.on('error', function(e) {
            emitter.emit('error', String(e));
        });

        return emitter;
    }
};

function submitStatus(irc_handle, irc_channel, content) {
}
