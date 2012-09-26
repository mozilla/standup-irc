exports.upgrade = function(client) {
    client.query("CREATE TABLE channel_settings (id bigint NOT NULL, " +
                 "channel character varying(255), " +
                 "name character varying(255), " +
                 "value character varying(255));");
    client.query("CREATE SEQUENCE channel_settings_id_seq " +
                 "START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;");
    client.query("ALTER SEQUENCE channel_settings_id_seq " +
                 "OWNED BY channel_settings.id;");
    client.query("ALTER TABLE ONLY channel_settings ALTER COLUMN id " +
                 "SET DEFAULT nextval('channel_settings_id_seq'::regclass);");
    client.query("ALTER TABLE ONLY channel_settings ADD CONSTRAINT " +
                 "channel_settings_pkey PRIMARY KEY (id);");
}

exports.downgrade = function(client) {
    client.query("DROP channel_settings");
    client.query("DROP SEQUENCE channel_settings_id_seq");
}