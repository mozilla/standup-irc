exports.upgrade = function(client) {
    client.query("CREATE TABLE channels (id character varying(50) NOT NULL, " +
                 "invited_by character varying(100), invited_at timestamp " +
                 "with time zone DEFAULT now());");
    client.query("ALTER TABLE ONLY channels ADD CONSTRAINT channels_pkey " +
                 "PRIMARY KEY (id);");
}

exports.downgrade = function(client) {
    client.query("DROP channels");
    client.query("DROP pg_migrations");
}
