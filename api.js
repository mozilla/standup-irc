/* Functions to access the remote web api of a standup app. */
var _ = require('underscore');

var utils = require('./utils');

exports.status = {
    /* Create a status message.
     * - `user`: The user that submitted the status.
     * - `project`: The project associated with the status.
     * - `content`: The text of the status.
     */
    create: function(user, project, content) {
        if (project.charAt(0) === '#') {
            project = project.slice(1);
        }
        var data = {
            user: user,
            project: project,
            content: content,
            api_key: CONFIG.standup.api_key
        };
        return utils.request('/api/v1/status/', 'POST', data);
    },

    /* Delete a status.
     * - `id`: The id of the status to delete.
     */
    delete_: function(id, user) {
        var data = {
            user: user,
            api_key: CONFIG.standup.api_key
        };
        return utils.request('/api/v1/status/' + id + '/', 'DELETE', data);
    }
};

exports.user = {
    /* Change a user's values
     * - `target_user` - The user to modify.
     * - `acting_user` - The user making the changes.
     * - `changes` - An object describing the changes to be made. For example,
     *   to change the email of a user, this would be {email: 'bob@example.com'}
     */
    update: function(target_user, acting_user, changes) {
        var data = {
            api_key: CONFIG.standup.api_key,
            user: acting_user
        };
        _.extend(data, changes);
        return utils.request('/api/v1/user/' + target_user + '/', 'POST', data);
    }
};
