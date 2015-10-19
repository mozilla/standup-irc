CREATE TABLE pg_migrations (id integer NOT NULL, migrated_at timestamp with time zone DEFAULT now());
ALTER TABLE ONLY pg_migrations ADD CONSTRAINT pg_migrations_pkey PRIMARY KEY (id);
