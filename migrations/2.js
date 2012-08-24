exports.upgrade = function(client) {
    client.query("CREATE TABLE blacklist (id character varying(100) NOT NULL, " +
                 "blacklisted_by character varying(100), " +
                 "blacklisted_at timestamp with time zone DEFAULT now());");
    client.query("ALTER TABLE ONLY blacklist ADD CONSTRAINT " +
                 "blacklist_pkey PRIMARY KEY (id);");
}

exports.downgrade = function(client) {
    client.query("DROP blacklist");
}