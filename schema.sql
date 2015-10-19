/* 1 */
CREATE TABLE channels (
    id character varying(50) NOT NULL,
    invited_by character varying(100),
    invited_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);

/* 2 */
CREATE TABLE blacklist (
    id character varying(100) NOT NULL,
    blacklisted_by character varying(100),
    blacklisted_at timestamp with time zone DEFAULT now()
);
ALTER TABLE ONLY blacklist
    ADD CONSTRAINT blacklist_pkey PRIMARY KEY (id);

/* 3 */
CREATE TABLE channel_settings (
    id bigint NOT NULL,
    channel character varying(255),
    name character varying(255),
    value character varying(255)
);
CREATE SEQUENCE channel_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE channel_settings_id_seq
    OWNED BY channel_settings.id;
ALTER TABLE ONLY channel_settings
    ALTER COLUMN id
    SET DEFAULT nextval('channel_settings_id_seq'::regclass);
ALTER TABLE ONLY channel_settings
    ADD CONSTRAINT channel_settings_pkey PRIMARY KEY (id);
