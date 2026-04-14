const express = require('express');
const crypto  = require('crypto');
const Kahoot  = require('kahoot.js-latest');
const words   = require('an-array-of-english-words');
const random  = require('random-name');

const path = require('path');
const fs   = require('fs');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.use(express.static('public'));
app.use('/three', express.static(path.join(__dirname, 'node_modules/three')));

const DOWNLOADABLE = [
  'server.js',
  'package.json',
  'render.yaml',
  'flood.js',
  'public/index.html',
  'public/login.html',
  'public/dashboard.html',
  'public/chess.html',
  'public/spam.html',
  'public/dominate.html',
  'public/rivals.html',
  'public/soccer-random.html',
  'public/home.html',
  'public/viewers.js',
  'public/download.html',
];

app.get('/download-file', (req, res) => {
  const f = req.query.f;
  if (!DOWNLOADABLE.includes(f)) return res.status(403).send('Forbidden');
  res.download(path.resolve(f), path.basename(f), { dotfiles: 'allow' });
});

process.setMaxListeners(Infinity);

const USERS_FILE    = path.join(__dirname, 'users.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const SESSION_TTL   = 30 * 24 * 60 * 60 * 1000;

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            return new Map(Object.entries(data));
        }
    } catch (e) {
        console.error('Failed to load users file:', e.message);
    }
    return new Map();
}

function saveUsers(users) {
    try {
        const data = {};
        for (const [key, val] of users.entries()) data[key] = val;
        fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to save users file:', e.message);
    }
}

function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
            const map = new Map();
            const now = Date.now();
            for (const [token, val] of Object.entries(data)) {
                if (val.expires > now) map.set(token, val);
            }
            return map;
        }
    } catch (e) {
        console.error('Failed to load sessions file:', e.message);
    }
    return new Map();
}

function saveSessions(sessions) {
    try {
        const data = {};
        for (const [token, val] of sessions.entries()) data[token] = val;
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to save sessions file:', e.message);
    }
}

const users    = loadUsers();
const sessions = loadSessions();

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function getSession(req) {
    const cookie = req.headers.cookie || '';
    const match  = cookie.match(/(?:^|;\s*)session=([^;]+)/);
    if (!match) return null;
    const s = sessions.get(match[1]);
    if (!s) return null;
    if (s.expires < Date.now()) { sessions.delete(match[1]); return null; }
    return s;
}

function createSession(username) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username, tier: 'premium', expires: Date.now() + SESSION_TTL });
    saveSessions(sessions);
    return token;
}

app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Username and password are required.' });
    if (username.length < 3) return res.json({ success: false, error: 'Username must be at least 3 characters.' });
    if (password.length < 4) return res.json({ success: false, error: 'Password must be at least 4 characters.' });
    if (users.has(username.toLowerCase())) return res.json({ success: false, error: 'Username already taken.' });
    users.set(username.toLowerCase(), { username, password: hashPassword(password), starCoins: 0, banned: false });
    saveUsers(users);
    const token = createSession(username);
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000`);
    res.json({ success: true });
});

app.post('/auth', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Username and password are required.' });

    // Hardcoded admin — always works regardless of users.json
    if (username.toLowerCase() === ADMIN_USER.toLowerCase() && hashPassword(password) === ADMIN_PASS) {
        const token = createSession(ADMIN_USER);
        res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000`);
        return res.json({ success: true });
    }

    const user = users.get(username.toLowerCase());
    if (!user || user.password !== hashPassword(password)) {
        return res.json({ success: false, error: 'Incorrect username or password.' });
    }
    if (user.banned) {
        return res.json({ success: false, error: 'This account has been banned.' });
    }
    const token = createSession(user.username);
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=2592000`);
    res.json({ success: true });
});

const ADMIN_USER = '293802';
const ADMIN_PASS = hashPassword('P@ssword12345');

app.get('/session', (req, res) => {
    const s = getSession(req);
    const isAdmin = s && s.username && s.username.toLowerCase() === ADMIN_USER.toLowerCase();
    res.json({ tier: s ? s.tier : null, username: s ? s.username : null, isAdmin: !!isAdmin });
});

function requireAdmin(req, res) {
    const s = getSession(req);
    if (!s || !s.username || s.username.toLowerCase() !== ADMIN_USER.toLowerCase()) {
        res.status(403).json({ error: 'Forbidden' });
        return null;
    }
    return s;
}

app.get('/admin-data', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const now = Date.now();
    const allUsers = [];
    for (const [key, val] of users.entries()) {
        allUsers.push({
            username: val.username || key,
            starCoins: val.starCoins || 0,
            banned: !!val.banned
        });
    }
    let activeSessions = 0;
    for (const [, val] of sessions.entries()) {
        if (val.expires > now) activeSessions++;
    }
    res.json({ totalUsers: allUsers.length, users: allUsers, activeSessions });
});

app.post('/admin/delete-user', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { username } = req.body;
    if (!username) return res.json({ success: false, error: 'Username required.' });
    const key = username.toLowerCase();
    if (key === ADMIN_USER.toLowerCase()) return res.json({ success: false, error: 'Cannot delete admin account.' });
    if (!users.has(key)) return res.json({ success: false, error: 'User not found.' });
    users.delete(key);
    saveUsers(users);
    // Also kill their sessions
    for (const [token, val] of sessions.entries()) {
        if (val.username && val.username.toLowerCase() === key) sessions.delete(token);
    }
    saveSessions(sessions);
    res.json({ success: true });
});

app.post('/admin/ban-user', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { username, banned } = req.body;
    if (!username) return res.json({ success: false, error: 'Username required.' });
    const key = username.toLowerCase();
    if (key === ADMIN_USER.toLowerCase()) return res.json({ success: false, error: 'Cannot ban admin account.' });
    const user = users.get(key);
    if (!user) return res.json({ success: false, error: 'User not found.' });
    user.banned = !!banned;
    users.set(key, user);
    saveUsers(users);
    // Kill sessions if banning
    if (banned) {
        for (const [token, val] of sessions.entries()) {
            if (val.username && val.username.toLowerCase() === key) sessions.delete(token);
        }
        saveSessions(sessions);
    }
    res.json({ success: true });
});

app.post('/admin/give-coins', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { username, amount } = req.body;
    if (!username) return res.json({ success: false, error: 'Username required.' });
    const coins = parseInt(amount, 10);
    if (isNaN(coins)) return res.json({ success: false, error: 'Invalid amount.' });
    const key = username.toLowerCase();
    const user = users.get(key);
    if (!user) return res.json({ success: false, error: 'User not found.' });
    user.starCoins = Math.max(0, (user.starCoins || 0) + coins);
    users.set(key, user);
    saveUsers(users);
    res.json({ success: true, newBalance: user.starCoins });
});

// ── CHESS PRESENCE ───────────────────────────────────────────────────────────
const chessActive = new Map(); // username -> lastSeen ms
const CHESS_TTL = 45 * 1000;  // 45 s without heartbeat = offline

app.post('/chess/heartbeat', (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    chessActive.set(s.username.toLowerCase(), { username: s.username, lastSeen: Date.now() });
    res.json({ ok: true });
});

app.get('/chess/active-users', (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    const now = Date.now();
    const me = s.username.toLowerCase();
    const meUser = users.get(me);
    const myFriends = new Set((meUser && meUser.friends) ? meUser.friends.map(f => f.toLowerCase()) : []);
    const active = [];
    for (const [key, val] of chessActive.entries()) {
        if (now - val.lastSeen > CHESS_TTL) { chessActive.delete(key); continue; }
        if (key === me) continue;
        active.push({
            username: val.username,
            isFriend: myFriends.has(key)
        });
    }
    // Also build friends list (all friends, online flag)
    const friendsList = [];
    for (const f of myFriends) {
        const fu = users.get(f);
        const online = chessActive.has(f) && (now - chessActive.get(f).lastSeen <= CHESS_TTL);
        friendsList.push({ username: fu ? fu.username : f, online });
    }
    res.json({ active, friends: friendsList });
});

// ── 1v1 CHALLENGES ────────────────────────────────────────────────────────────
const chessChallenges = new Map(); // id -> challenge object
const CHALLENGE_TTL = 90 * 1000;

function cleanupChallenges() {
    const now = Date.now();
    for (const [id, c] of chessChallenges.entries()) {
        if (now - c.createdAt > CHALLENGE_TTL) chessChallenges.delete(id);
    }
}

app.post('/chess/challenge', (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    const { targetUsername } = req.body;
    if (!targetUsername) return res.json({ success: false, error: 'Target required.' });
    const fromKey = s.username.toLowerCase();
    const toKey = targetUsername.toLowerCase();
    if (fromKey === toKey) return res.json({ success: false, error: 'Cannot challenge yourself.' });
    cleanupChallenges();
    for (const c of chessChallenges.values()) {
        if (c.from === fromKey && c.to === toKey && c.status === 'pending') {
            return res.json({ success: false, error: 'Challenge already sent.' });
        }
    }
    const id = crypto.randomBytes(8).toString('hex');
    chessChallenges.set(id, {
        id, from: fromKey, fromDisplay: s.username,
        to: toKey, toDisplay: targetUsername,
        status: 'pending', createdAt: Date.now()
    });
    res.json({ success: true, id });
});

app.get('/chess/challenges', (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    cleanupChallenges();
    const me = s.username.toLowerCase();
    const incoming = [], outgoing = [];
    for (const c of chessChallenges.values()) {
        if (c.to === me && c.status === 'pending') incoming.push({ id: c.id, from: c.fromDisplay });
        if (c.from === me) outgoing.push({ id: c.id, to: c.toDisplay, status: c.status });
    }
    res.json({ incoming, outgoing });
});

app.post('/chess/challenge/respond', (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    const { id, accept } = req.body;
    const c = chessChallenges.get(id);
    if (!c) return res.json({ success: false, error: 'Challenge not found or expired.' });
    if (c.to !== s.username.toLowerCase()) return res.json({ success: false, error: 'Not your challenge.' });
    c.status = accept ? 'accepted' : 'declined';
    setTimeout(() => chessChallenges.delete(id), 20000);
    res.json({ success: true });
});

app.post('/chess/challenge/cancel', (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    const { id } = req.body;
    const c = chessChallenges.get(id);
    if (!c) return res.json({ success: true });
    if (c.from !== s.username.toLowerCase()) return res.json({ success: false, error: 'Not your challenge.' });
    chessChallenges.delete(id);
    res.json({ success: true });
});

// ── FRIENDS ───────────────────────────────────────────────────────────────────
app.post('/friends/add', (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    const { username } = req.body;
    if (!username) return res.json({ success: false, error: 'Username required.' });
    const meKey = s.username.toLowerCase();
    const themKey = username.toLowerCase();
    if (meKey === themKey) return res.json({ success: false, error: 'Cannot add yourself.' });
    if (!users.has(themKey)) return res.json({ success: false, error: 'User not found.' });
    const me = users.get(meKey);
    if (!me) return res.json({ success: false, error: 'Your account not found.' });
    if (!me.friends) me.friends = [];
    if (!me.friends.map(f => f.toLowerCase()).includes(themKey)) {
        me.friends.push(username);
        users.set(meKey, me);
        saveUsers(users);
    }
    res.json({ success: true });
});

app.post('/friends/remove', (req, res) => {
    const s = getSession(req);
    if (!s) return res.status(401).json({ error: 'Not logged in' });
    const { username } = req.body;
    if (!username) return res.json({ success: false, error: 'Username required.' });
    const meKey = s.username.toLowerCase();
    const themKey = username.toLowerCase();
    const me = users.get(meKey);
    if (!me) return res.json({ success: false, error: 'Account not found.' });
    me.friends = (me.friends || []).filter(f => f.toLowerCase() !== themKey);
    users.set(meKey, me);
    saveUsers(users);
    res.json({ success: true });
});

app.get('/logout', (req, res) => {
    const cookie = req.headers.cookie || '';
    const match  = cookie.match(/(?:^|;\s*)session=([^;]+)/);
    if (match) sessions.delete(match[1]);
    res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0');
    res.redirect('/login.html');
});

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomName() {
    const style = randInt(1, 4);
    if (style === 1) return random.first() + random.last();
    if (style === 2) return random.first() + random.middle() + random.last();
    if (style === 3) return random.first();
    return words[randInt(0, words.length - 1)];
}

function applyBypass(name) {
    const map = {
        a:'ᗩ',b:'ᗷ',c:'ᑕ',d:'ᗪ',e:'E',f:'ᖴ',g:'G',h:'ᕼ',i:'I',j:'ᒍ',
        k:'K',l:'ᒪ',m:'ᗰ',n:'ᑎ',o:'O',p:'ᑭ',q:'ᑫ',r:'ᖇ',s:'S',t:'T',
        u:'ᑌ',v:'ᐯ',w:'ᗯ',x:'᙭',y:'Y',z:'ᘔ',' ':'\u2002'
    };
    return name.toLowerCase().split('').map(c => map[c] || c).join('');
}

function makeUniqueSuffix(index) {
    if (index === 0) return '';
    const chars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
    let result = '', n = index;
    while (n > 0) { result = chars[n % 4] + result; n = Math.floor(n / 4); }
    return result;
}

const floodClients    = [];
const spamClients     = [];
const dominateClients = [];

let floodStopped    = false;
let spamStopped     = false;
let dominateStopped = false;

function sseRoute(clientList) {
    return (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.flushHeaders();
        // Send a comment ping immediately so the proxy knows the connection is alive
        res.write(': ping\n\n');
        clientList.push(res);
        // Keep-alive ping every 15s so proxies don't close the connection
        const keepAlive = setInterval(() => {
            try { res.write(': ping\n\n'); } catch (e) { clearInterval(keepAlive); }
        }, 15000);
        req.on('close', () => {
            clearInterval(keepAlive);
            const idx = clientList.indexOf(res);
            if (idx !== -1) clientList.splice(idx, 1);
        });
    };
}

function broadcastTo(clientList, type, message, extra) {
    const data = JSON.stringify({ type, message, ...extra });
    clientList.forEach(c => c.write(`data: ${data}\n\n`));
}

app.get('/events',          sseRoute(floodClients));
app.get('/spam-events',     sseRoute(spamClients));
app.get('/dominate-events', sseRoute(dominateClients));

app.post('/stop', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'Not logged in.' });
    floodStopped = true;
    broadcastTo(floodClients, 'info', 'Stop signal sent — bots will not respawn.');
    res.json({ success: true });
});

app.post('/spam-stop', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'Not logged in.' });
    spamStopped = true;
    broadcastTo(spamClients, 'info', 'Stop signal sent — bots will not respawn.');
    res.json({ success: true });
});

app.post('/dominate-stop', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'Not logged in.' });
    dominateStopped = true;
    broadcastTo(dominateClients, 'info', 'Stop signal sent — bots will not respawn.');
    res.json({ success: true });
});

app.post('/start', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'Not logged in.' });

    const maxBots = 400;
    let { pin, botCount, useRandom, botName, useBypass } = req.body;
    if (!pin || !botCount) return res.json({ success: false, error: 'PIN and bot count are required.' });
    botCount = Math.min(parseInt(botCount), maxBots);

    floodStopped = false;
    let joined = 0, failed = 0;

    broadcastTo(floodClients, 'info', `Launching ${botCount} bots into game ${pin}...`);

    function getBotName(index) {
        let name = useRandom ? randomName() : `${botName || 'Bot'}${index + 1}`;
        if (useBypass) name = applyBypass(name);
        return name;
    }

    function spawnBot(index) {
        if (floodStopped) return;
        const name   = getBotName(index);
        const client = new Kahoot();
        client.setMaxListeners(Infinity);

        client.join(pin, name).catch(err => {
            const msg = (err && (err.description || err.message)) || String(err);
            if (msg.toLowerCase().includes('duplicate') && useRandom && !floodStopped) {
                setTimeout(() => spawnBot(index), 200);
            } else {
                failed++;
                broadcastTo(floodClients, 'fail', `Bot ${index + 1} failed — ${msg}`, { joined, failed, total: botCount });
            }
        });

        client.on('Joined', () => {
            joined++;
            broadcastTo(floodClients, 'join', `${name} joined! (${joined}/${botCount})`, { joined, failed, total: botCount });
        });

        client.on('QuestionStart', question => {
            const numAnswers = (question.quizQuestionAnswers && question.quizQuestionAnswers[question.questionIndex]) || 4;
            const delay = randInt(500, 4000);
            if (question.type === 'word_cloud' || question.type === 'open_ended') {
                const word = words[randInt(0, words.length - 1)];
                setTimeout(() => {
                    question.answer(word);
                    broadcastTo(floodClients, 'answer', `${name} answered Q${question.questionIndex + 1} → "${word}"`);
                }, delay);
            } else {
                const choice = randInt(0, numAnswers - 1);
                const labels = ['Red', 'Blue', 'Yellow', 'Green'];
                setTimeout(() => {
                    question.answer(choice);
                    broadcastTo(floodClients, 'answer', `${name} answered Q${question.questionIndex + 1} → ${labels[choice] || choice}`);
                }, delay);
            }
        });

        client.on('QuizEnd', data => {
            if (data) broadcastTo(floodClients, 'end', `${name} finished — Rank: ${data.rank}`);
        });

        client.on('Disconnect', reason => {
            if (reason !== 'Quiz Locked' && !floodStopped) setTimeout(() => spawnBot(index), 1000);
        });
    }

    for (let i = 0; i < botCount; i++) {
        setTimeout(() => spawnBot(i), i * randInt(100, 300));
    }

    res.json({ success: true, botCount });
});

app.post('/spam-start', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'Not logged in.' });

    const maxBots = 400;
    let { pin, message, count, useBypass } = req.body;
    if (!pin || !message || !count) return res.json({ success: false, error: 'All fields are required.' });
    count = Math.min(parseInt(count), maxBots);

    spamStopped = false;
    let joined = 0, failed = 0;

    broadcastTo(spamClients, 'info', `Sending "${message}" x${count} into game ${pin}...`);

    function spawnSpammer(index) {
        if (spamStopped) return;
        let name = message.replace(/ /g, '\u2002') + makeUniqueSuffix(index);
        if (useBypass) name = applyBypass(name);

        const client = new Kahoot();
        client.setMaxListeners(Infinity);

        client.join(pin, name).catch(err => {
            const msg = (err && (err.description || err.message)) || String(err);
            if (msg.toLowerCase().includes('duplicate')) {
                let altName = message.replace(/ /g, '\u2002') + makeUniqueSuffix(index + 1000);
                if (useBypass) altName = applyBypass(altName);
                const retry = new Kahoot();
                retry.setMaxListeners(Infinity);
                retry.join(pin, altName).catch(() => {});
                retry.on('Joined', () => {
                    joined++;
                    broadcastTo(spamClients, 'join', `"${altName}" joined! (${joined}/${count})`, { joined, failed, total: count });
                });
            } else {
                failed++;
                broadcastTo(spamClients, 'fail', `Slot ${index + 1} failed — ${msg}`, { joined, failed, total: count });
            }
        });

        client.on('Joined', () => {
            joined++;
            broadcastTo(spamClients, 'join', `"${name}" joined! (${joined}/${count})`, { joined, failed, total: count });
        });

        client.on('QuestionStart', question => {
            const numAnswers = (question.quizQuestionAnswers && question.quizQuestionAnswers[question.questionIndex]) || 4;
            setTimeout(() => question.answer(randInt(0, numAnswers - 1)), randInt(500, 4000));
        });

        client.on('Disconnect', reason => {
            if (reason !== 'Quiz Locked' && !spamStopped) setTimeout(() => spawnSpammer(index), 1000);
        });
    }

    for (let i = 0; i < count; i++) {
        setTimeout(() => spawnSpammer(i), i * randInt(80, 200));
    }

    res.json({ success: true, count });
});

app.post('/dominate', (req, res) => {
    const session = getSession(req);
    if (!session) return res.json({ success: false, error: 'Not logged in.' });

    let { pin, botCount, botName, useBypass, speedMin, speedMax } = req.body;
    if (!pin || !botCount) return res.json({ success: false, error: 'PIN and bot count are required.' });
    botCount = Math.min(parseInt(botCount), 400);

    dominateStopped = false;
    const prefix = botName || 'Player';
    let joined = 0, failed = 0;

    broadcastTo(dominateClients, 'info', `Launching ${botCount} bots into game ${pin} at max speed...`);

    function spawnDominator(index) {
        if (dominateStopped) return;
        let name = `${prefix}${index + 1}`.slice(0, 20) + makeUniqueSuffix(index);
        if (useBypass) name = applyBypass(name);

        const client = new Kahoot();
        client.setMaxListeners(Infinity);

        client.join(pin, name).catch(err => {
            const msg = (err && (err.description || err.message)) || String(err);
            failed++;
            broadcastTo(dominateClients, 'fail', `Bot ${index + 1} failed — ${msg}`, { joined, failed, total: botCount });
        });

        client.on('Joined', () => {
            joined++;
            broadcastTo(dominateClients, 'join', `${name} joined! (${joined}/${botCount})`, { joined, failed, total: botCount });
        });

        client.on('QuestionStart', question => {
            const numAnswers = (question.quizQuestionAnswers && question.quizQuestionAnswers[question.questionIndex]) || 4;
            const delay = randInt(speedMin || 50, speedMax || 200);
            if (question.type === 'word_cloud' || question.type === 'open_ended') {
                const word = words[randInt(0, words.length - 1)];
                setTimeout(() => {
                    question.answer(word);
                    broadcastTo(dominateClients, 'answer', `${name} answered Q${question.questionIndex + 1} in ${delay}ms`);
                }, delay);
            } else {
                const choice = randInt(0, numAnswers - 1);
                const labels = ['Red', 'Blue', 'Yellow', 'Green'];
                setTimeout(() => {
                    question.answer(choice);
                    broadcastTo(dominateClients, 'answer', `${name} answered Q${question.questionIndex + 1} → ${labels[choice] || choice} (${delay}ms)`);
                }, delay);
            }
        });

        client.on('QuizEnd', data => {
            if (data) broadcastTo(dominateClients, 'end', `${name} finished — Rank: ${data.rank} / Score: ${data.totalScore}`);
        });

        client.on('Disconnect', reason => {
            if (reason !== 'Quiz Locked' && !dominateStopped) setTimeout(() => spawnDominator(index), 1000);
        });
    }

    for (let i = 0; i < botCount; i++) {
        setTimeout(() => spawnDominator(i), i * randInt(80, 200));
    }

    res.json({ success: true, botCount });
});

app.get('/health', (req, res) => res.sendStatus(200));

const activeViewers = new Map();
const viewerSseClients = new Set();

function broadcastViewerCount() {
    const count = activeViewers.size;
    const msg = `data: ${count}\n\n`;
    for (const client of viewerSseClients) {
        try { client.write(msg); } catch (_) {}
    }
}

function pruneViewers() {
    const cutoff = Date.now() - 60000;
    let changed = false;
    for (const [key, ts] of activeViewers.entries()) {
        if (ts < cutoff) { activeViewers.delete(key); changed = true; }
    }
    if (changed) broadcastViewerCount();
}

setInterval(pruneViewers, 20000);

app.get('/viewer-events', (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    res.write(`data: ${activeViewers.size}\n\n`);
    viewerSseClients.add(res);
    req.on('close', () => viewerSseClients.delete(res));
});

app.post('/ping', (req, res) => {
    const { id } = req.body;
    const prevSize = activeViewers.size;
    if (id) activeViewers.set(id, Date.now());
    pruneViewers();
    if (activeViewers.size !== prevSize) broadcastViewerCount();
    res.json({ count: activeViewers.size });
});

app.post('/leave', (req, res) => {
    const { id } = req.body;
    if (id) activeViewers.delete(id);
    broadcastViewerCount();
    res.sendStatus(204);
});

app.get('/viewers', (req, res) => {
    pruneViewers();
    res.json({ count: activeViewers.size });
});

if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Kahootinator 3.0 running on port ${PORT}`);
    });
}

module.exports = app;
