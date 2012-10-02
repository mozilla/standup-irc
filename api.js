/* Functions to access the remote web api of a standup app. */
var utils = require('./utils');

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
