var _ = require('lodash');
var fs = require('fs');
var path = require('path');

var existsSync = fs.existsSync || path.existsSync;

// Global config.
if (existsSync('./config.json')) {
    config = require('./config.json');
}

config = _.extend({}, config || {});

if (config.pg.enabled) {
    var pg = require('pg');

    if (!config.pg.connstring) {
        console.log("No connection string found. Checking for DATABASE_URL.");
        config.pg.connstring = process.env.DATABASE_URL;
    }

    if (config.pg.connstring) {
        console.log("Connecting to: " + config.pg.connstring);
        var client = new pg.Client(config.pg.connstring);
        client.connect();
    }

    if (client) {
        var current = 0;
        var query = client.query("SELECT id FROM pg_migrations " +
                                 "ORDER BY id DESC LIMIT 1");

        query.on('error', function(error) { /* Do nothing */ });

        query.on('row', function(row) {
            current = row.id;
        });

        query.on('end', function(result) {
            current++;

            while(existsSync('./migrations/' + current + '.js')) {
                console.log('Running migration #' + current);
                var migration = require('./migrations/' + current);
                migration.upgrade(client);
                client.query("INSERT INTO pg_migrations (id) values (" +
                             current + ")");
                current++;
            }

            query = client.query("SELECT id FROM pg_migrations LIMIT 1");

            query.on('end', function(result) {
                client.end();
            });
        });
    }
}
