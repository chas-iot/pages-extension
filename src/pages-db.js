/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const DatabaseA = require('./db');

const PagesDB = {

    database: null,

    open: function(db_location) {
        this.database = DatabaseA;
        return this.database.open(db_location, this._createTables);
    },

    get_list: function(rowtype) {
        return this.database.get_all(
            'SELECT * ' +
            'FROM principal ' +
            'WHERE rowtype = ?;', [rowtype]
        );
    },

    get_contents: function(rowid) {
        return this.database.get_all(
            'SELECT principal.* ' +
            ', -1 AS link_rowid ' +
            'FROM principal ' +
            'WHERE rowid = ? ' +
            'UNION ' +
            'SELECT principal.* ' +
            ', link.rowid AS link_rowid ' +
            'FROM principal ' +
            'JOIN link ' +
            'ON link.contained = principal.rowid ' +
            'AND link.container = ? ;', [rowid, rowid]);
    },

    add_principal: async function(rowtype, name) {
        // there may genuinely be things with duplicate names, 
        // so prevent duplicate groups here rather than with a unique index
        const t = await this.database.get(
            'SELECT count(*) AS gc ' +
            'FROM principal ' +
            'WHERE name = ? ' +
            'AND rowtype = ?', [name, rowtype]);
        if (t.gc > 0) {
            return null;
        }
        return this.database.run(
            'INSERT INTO principal (name, rowtype) ' +
            'VALUES (?, ?);', [name, rowtype]
        );
    },

    delete_principal: function(rowid) {
        // due to foreign keys cascading, this should delete the links to the page contents
        return this.database.run(
            'DELETE FROM principal ' +
            'WHERE rowid = ?;', [rowid]
        );

    },

    insert_link: async function(container, contained) {
        const result = await this.database.run(
            'INSERT INTO link (container, contained) ' +
            'VALUES (?, ?);', [container, contained]
        );
        if (result === null || result.lastid === null) {
            return null;
        }
        return {
            rowid: result.lastID,
            container: container,
            contained: contained,
        };
    },

    delete_link: async function(rowid) {
        return await this.database.run(
            'DELETE FROM link ' +
            'WHERE rowid = ?;', [rowid]);
    },

    get_available_links: async function(rowid, t1, t2, t3) {
        try {
            return await this.database.get_all(
                'SELECT * ' +
                'FROM principal ' +
                "WHERE rowtype in (?, ?, ?) " +
                'AND NOT rowid IN ( ' +
                '  SELECT contained ' +
                '  FROM link ' +
                '  WHERE container = ?) ' +
                'ORDER BY name;', [t1, t2, t3, rowid]
            );
        } catch (e) {
            console.log(e);
            return null;
        }
    },

    upsert_thing: async function(extid, name) {
        let t = await this.database.get(
            'SELECT * ' +
            'FROM principal ' +
            'WHERE extid = ?;', [extid]);

        if (t === null || t === undefined || t.extid !== extid) {
            return this.database.run(
                'INSERT INTO principal(rowtype,extid, name) ' +
                'VALUES (?, ?, ?);', ['T', extid, name]);
        }

        if (t.name === name) {
            // no action required
            return null;
        }

        return this.database.run(
            'UPDATE principal ' +
            'SET name = ? ' +
            'WHERE extid = ?;', [name, extid]);
    },

    cleanup_things: async function(active_things) {
        return PagesDB.database.run('DELETE FROM principal ' +
            "WHERE rowtype = 'T' " +
            `AND NOT extid in (${new Array(active_things.length).fill('?').join(',')})`,
            active_things
        );
    },

    _createTables: function(db) {
        // Create the groups related tables
        db.serialize(() => {
            db.exec('PRAGMA foreign_keys = ON;') // s/b a no-op if not supported
                .exec(
                    'CREATE TABLE IF NOT EXISTS principal (' +
                    'rowid INTEGER PRIMARY KEY AUTOINCREMENT,' +
                    'rowtype TEXT NOT NULL,' + // values G group; P page; T thing - possible expansion later to U user to support permissions
                    'name TEXT NOT NULL,' +
                    'extid TEXT' +
                    ');'
                )
                .exec(
                    'CREATE TABLE IF NOT EXISTS link (' +
                    'rowid INTEGER PRIMARY KEY AUTOINCREMENT,' +
                    'container INTEGER NOT NULL REFERENCES principal(rowid) ON DELETE CASCADE,' +
                    'contained INTEGER NOT NULL REFERENCES principal(rowid) ON DELETE CASCADE' +
                    ');'
                )
                .exec(
                    'CREATE UNIQUE INDEX IF NOT EXISTS links1 ON link(container, contained);'
                )
                .exec(
                    'CREATE INDEX IF NOT EXISTS links2 ON link(contained);'
                );
        });
    },

};

module.exports = PagesDB;