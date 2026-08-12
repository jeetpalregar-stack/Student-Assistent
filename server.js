const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { openDatabase, initializeDatabase } = require('./src/database');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'student-assistant.db');
const scrypt = promisify(crypto.scrypt);
let db;
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '50kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 250, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public')));

const cleanText = (value, maxLength = 5000) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const parseCookies = header => Object.fromEntries((header || '').split(';').map(x => x.trim().split('=').map(decodeURIComponent)).filter(x => x.length === 2));
async function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`; }
async function verifyPassword(password, stored) { const [salt, expected] = stored.split(':'); const derived = await scrypt(password, salt, 64); return crypto.timingSafeEqual(derived, Buffer.from(expected, 'hex')); }
function setSession(res, token) { res.setHeader('Set-Cookie', `asa_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`); }
async function createSession(res, userId) { const token = crypto.randomBytes(32).toString('hex'); await db.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))", [hashToken(token), userId]); setSession(res, token); }
async function requireUser(req, res, next) { try { const token = parseCookies(req.headers.cookie).asa_session; if (!token) return res.status(401).json({ error: 'Please sign in to continue.' }); const session = await db.get("SELECT users.id, users.name, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP", [hashToken(token)]); if (!session) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); req.user = session; next(); } catch (error) { next(error); } }

async function start() {
  db = await openDatabase(DB_PATH); await initializeDatabase(db);
  app.post('/api/auth/register', async (req, res, next) => { try { const name = cleanText(req.body.name, 80); const email = cleanText(req.body.email, 160).toLowerCase(); const password = typeof req.body.password === 'string' ? req.body.password : ''; const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : ''; if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Enter a name, valid email, and password of at least 8 characters.' }); if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' }); const r = await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, await hashPassword(password)]); await createSession(res, r.lastID); res.status(201).json({ user: { id: r.lastID, name, email } }); } catch (e) { if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'An account already exists for that email.' }); next(e); } });
  app.post('/api/auth/login', async (req, res, next) => { try { const email = cleanText(req.body.email, 160).toLowerCase(); const password = typeof req.body.password === 'string' ? req.body.password : ''; const user = await db.get('SELECT * FROM users WHERE email = ?', [email]); if (!user || !(await verifyPassword(password, user.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' }); await createSession(res, user.id); res.json({ user: { id: user.id, name: user.name, email: user.email } }); } catch (e) { next(e); } });
  app.post('/api/auth/logout', async (req, res, next) => { try { const token = parseCookies(req.headers.cookie).asa_session; if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]); res.setHeader('Set-Cookie', 'asa_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); res.status(204).end(); } catch (e) { next(e); } });
  app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: req.user }));
  app.get('/api/notes', requireUser, async (req, res, next) => { try { res.json(await db.all('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC', [req.user.id])); } catch (e) { next(e); } });
  app.post('/api/notes', requireUser, async (req, res, next) => { try { const title = cleanText(req.body.title, 120), content = cleanText(req.body.content); if (!title || !content) return res.status(400).json({ error: 'A title and note content are required.' }); const r = await db.run('INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)', [req.user.id, title, content]); res.status(201).json(await db.get('SELECT * FROM notes WHERE id = ? AND user_id = ?', [r.lastID, req.user.id])); } catch (e) { next(e); } });
  app.put('/api/notes/:id', requireUser, async (req, res, next) => { try { const id = Number(req.params.id), title = cleanText(req.body.title, 120), content = cleanText(req.body.content); if (!Number.isInteger(id) || id < 1 || !title || !content) return res.status(400).json({ error: 'Please provide valid note data.' }); const r = await db.run("UPDATE notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", [title, content, id, req.user.id]); if (!r.changes) return res.status(404).json({ error: 'Note not found.' }); res.json(await db.get('SELECT * FROM notes WHERE id = ?', id)); } catch (e) { next(e); } });
  app.delete('/api/notes/:id', requireUser, async (req, res, next) => { try { const r = await db.run('DELETE FROM notes WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]); if (!r.changes) return res.status(404).json({ error: 'Note not found.' }); res.status(204).end(); } catch (e) { next(e); } });
  app.get('/api/timetable', requireUser, async (req, res, next) => { try { res.json(await db.all('SELECT * FROM timetable_entries WHERE user_id = ? ORDER BY day, start_time', [req.user.id])); } catch (e) { next(e); } });
  app.post('/api/timetable', requireUser, async (req, res, next) => { try { const subject = cleanText(req.body.subject, 100), day = Number(req.body.day), start = cleanText(req.body.start_time, 5), end = cleanText(req.body.end_time, 5), color = /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : '#6c63ff'; if (!subject || !Number.isInteger(day) || day < 0 || day > 6 || !validTime(start) || !validTime(end) || start >= end) return res.status(400).json({ error: 'Please provide a subject, day, and valid time range.' }); const r = await db.run('INSERT INTO timetable_entries (user_id, subject, day, start_time, end_time, color) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, subject, day, start, end, color]); res.status(201).json(await db.get('SELECT * FROM timetable_entries WHERE id = ? AND user_id = ?', [r.lastID, req.user.id])); } catch (e) { next(e); } });
  app.delete('/api/timetable/:id', requireUser, async (req, res, next) => { try { const r = await db.run('DELETE FROM timetable_entries WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]); if (!r.changes) return res.status(404).json({ error: 'Session not found.' }); res.status(204).end(); } catch (e) { next(e); } });
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });
  app.listen(PORT, () => console.log(`AI Student Assistant running at http://localhost:${PORT}`));
}
start().catch(error => { console.error('Could not start application:', error); process.exit(1); });
