/* Functions to access the remote web api of a standup app. */
var events = require('events');
var http = require('http');
var querystring = require('querystring');
var utils = require('./utils');

var config = require('./config');

exports.status = {
    /* Create a status message.
     * - `user`: The user that submitted the status.
     * - `project`: The project associated with the status.
     * - `content`: The text of the status.
     * - `reply_to`: (Optional) The ID of the status being replied to
     */
    create: function(user, project, content, reply_to) {
        var data = {
            user: user,
            content: content,
            api_key: config.standup.api_key
        };
        if (reply_to) {
            data.reply_to = reply_to;
        }
        if (project !== null) {
            if (project[0] === '#') {
                project = project.slice(1);
            }
            data.project = project;
        }
        return utils.request('/api/v1/status/', 'POST', data);
    },

    /* Delete a status.
     * - `id`: The id of the status to delete.
     */
    delete: function(id, user) {
        var data = {
            user: user,
            api_key: config.standup.api_key
        };
        return utils.request('/api/v1/status/' + id + '/', 'DELETE', data);
    }
};

exports.user = {
    /* Update a users settings.
     * - `nick`: The nick of the user that submitted the request.
     * - `user`: The user who's settings to change
     * - `key`: The name of the setting to be changed.
     * - `value`: The new value of the setting.
     */
    update: function(nick, key, value, user) {
        var data = {
            user: nick,
            api_key: config.standup.api_key
        };
        data[key] = value;
        return utils.request('/api/v1/user/' + user + '/', 'POST', data);
    }
};

exports.team = {
    /* Create a new team.
     * - `slug`: The slug for the team.
     * - `name`: The name of the team.
     */
    create: function(slug, name) {
        var data = {
            slug: slug,
            name: name,
            api_key: config.standup.api_key
        };
        return v2.post('/teams/create.json', data);
    },

    /* Remove a team.
     * - `slug`: The slug for the team.
     */
    remove: function(slug) {
        var data = {
            slug: slug,
            api_key: config.standup.api_key
        };
        return v2.post('/teams/destroy.json', data);
    },

    /* Add a user to a team.
     * - `slug`: The slug for the team.
     * - `user`: The user's username.
     */
    add_member: function(slug, user) {
        var data = {
            slug: slug,
            screen_name: user,
            api_key: config.standup.api_key
        };
        return v2.post('/teams/members/create.json', data);
    },

    /* Remove a user from a team.
     * - `slug`: The slug for the team.
     * - `user`: The user's username.
     */
    remove_member: function(slug, user) {
        var data = {
            slug: slug,
            screen_name: user,
            api_key: config.standup.api_key
        };
        return v2.post('/teams/members/destroy.json', data);
    }
};

var v2 = {
    _url: function(endpoint) {
        return '/api/v2' + endpoint;
    },

    _makeRequest: function(options, emitter) {
        if (emitter === undefined) {
            emitter = new events.EventEmitter();
        }

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
                   v2.request(res.headers.location, options.method, options.data, emitter);
                } else {
                    emitter.emit('error', res.statusCode, resp_data);
                }
            });
        });

        req.once('error', function(e) {
            global.logger.error(options.host + ':' + options.port + options.path +
                ': ' + JSON.stringify(options.data));
            emitter.emit('error', String(e));
        });

        return emitter;
    },

    request: function(endpoint, method, data, emitter) {
        if (method === 'POST') {
            v2.post(endpoint, data, emitter);
        } else {
            v2.get(endpoint, data, emitter);
        }
    },

    post: function(endpoint, data, emitter) {
        var url = v2._url(endpoint);

        data = querystring.stringify(data);

        var options = {
            host: config.standup.host,
            port: config.standup.port,
            path: url,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        return v2._makeRequest(options, emitter);
    },

    get: function(endpoint, data, emitter) {
        var url = v2._url(endpoint) + '?' + querystring.stringify(data);

        var options = {
            host: config.standup.host,
            port: config.standup.port,
            path: url,
            method: 'GET'
        };

        return v2._makeRequest(options, emitter);
    }
};

exports.v2 = v2;
