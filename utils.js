var _ = require('underscore');

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
