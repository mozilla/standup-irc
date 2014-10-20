var _ = require('lodash');
var events = require('events');

var AuthManager = function() {
    this.neededLevel = 2;
    this.STATUSRE = /^STATUS ([^ ]+) (\d).*$/;
    this.users = {};
};

AuthManager.prototype._user = function(nick) {
    this.users[nick] = _.extend({}, {
        auth: null,
        emitter: new events.EventEmitter()
    }, this.users[nick]);

    return this.users[nick];
};

AuthManager.prototype.notice = function(nick, message) {
    if (nick !== 'nickserv') {
        return;
    }
    global.logger.info('nickserv notice', message);
    var match = this.STATUSRE.exec(message);
    if (match) {
        global.logger.info('STATUSRE matched');
        var user_nick = match[1];
        var level = match[2];
        var user = this._user(user_nick);

        if (level >= this.neededLevel) {
            user.auth = true;
            user.emitter.emit('authorization', true);
        } else {
            user.auth = false;
            user.emitter.emit('authorization', false);
        }
    }
};

AuthManager.prototype.checkUser = function(nick) {
    var self = this;
    var user = this._user(nick);
    process.nextTick(function() {
        if (user.auth) {
            user.emitter.emit('authorization', true);
        } else {
            self._askNickserv(nick);
        }
    });
    return user.emitter;
};

AuthManager.prototype._askNickserv = function(nick) {
    var msg = 'status ' + nick;
    global.logger.info('Asking nickserv: "' + msg + '"');
    global.irc_client.say('nickserv', msg);
};

exports.AuthManager = AuthManager;
