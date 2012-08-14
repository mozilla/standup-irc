var events = require('events');
var _ = require('underscore');


this.AuthManager = function() {
    this.neededLevel = 2;
    this.STATUSRE = /^STATUS ([^ ]+) (\d)$/;
    this.users = {};
};

this.AuthManager.prototype._user = function(nick) {
    this.users[nick] = _.extend({}, {
        auth: null,
        emitter: new events.EventEmitter()
    }, this.users[nick]);

    return this.users[nick];
};

this.AuthManager.prototype.notice = function(nick, message) {
    if (nick !== 'nickserv') {
        return;
    }
    var match = this.STATUSRE.exec(message);
    if (match) {
        var user_nick = match[1];
        var level = match[2];
        var user = this._user(user_nick);

        if (level >= this.neededLevel) {
            user.auth = true;
            user.emitter.emit('authorized');
        } else {
            user.auth = false;
            user.emitter.emit('unauthorized');
        }
    }
};

this.AuthManager.prototype.checkUser = function(nick) {
    var self = this;
    var user = this._user(nick);
    if (user.auth) {
        process.nextTick(function() {
                user.emitter.emit('authorized');
        });
    } else {
        self._askNickserv(nick);
    }
    return user.emitter;
};

this.AuthManager.prototype._askNickserv = function(nick) {
    var msg = 'status ' + nick;
    client.say('nickserv', msg);
};
