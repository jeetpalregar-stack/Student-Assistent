const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function openDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  return new Promise((resolve, reject) => {
    const raw = new sqlite3.Database(filename, error => {
      if (error) return reject(error);
      resolve({
        run: (sql, params = []) => new Promise((ok, fail) => raw.run(sql, params, function (err) { err ? fail(err) : ok({ lastID: this.lastID, changes: this.changes }); })),
        get: (sql, params = []) => new Promise((ok, fail) => raw.get(sql, params, (err, row) => err ? fail(err) : ok(row))),
        all: (sql, params = []) => new Promise((ok, fail) => raw.all(sql, params, (err, rows) => err ? fail(err) : ok(rows)))
      });
    });
  });
}
async function initializeDatabase(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await db.run(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at DATETIME NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  await db.run(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT NOT NULL, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  await db.run(`CREATE TABLE IF NOT EXISTS timetable_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, subject TEXT NOT NULL, day INTEGER NOT NULL CHECK(day BETWEEN 0 AND 6), start_time TEXT NOT NULL, end_time TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#6c63ff', FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  const noteColumns = await db.all('PRAGMA table_info(notes)');
  if (!noteColumns.some(column => column.name === 'user_id')) await db.run('ALTER TABLE notes ADD COLUMN user_id INTEGER');
  const timetableColumns = await db.all('PRAGMA table_info(timetable_entries)');
  if (!timetableColumns.some(column => column.name === 'user_id')) await db.run('ALTER TABLE timetable_entries ADD COLUMN user_id INTEGER');
}
module.exports = { openDatabase, initializeDatabase };
