/* Functions to access the remote web api of a standup app. */
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
            user: utils.canonicalUsername(user),
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
            user: utils.canonicalUsername(user),
            api_key: CONFIG.standup.api_key
        };
        return utils.request('/api/v1/status/' + id + '/', 'DELETE', data);
    }
};

function submitStatus(irc_handle, irc_channel, content) {
}
