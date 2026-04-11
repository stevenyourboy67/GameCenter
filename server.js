const express = require('express');
const crypto  = require('crypto');
const Kahoot  = require('kahoot.js-latest');
const words   = require('an-array-of-english-words');
const random  = require('random-name');

const path = require('path');
const fs   = require('fs');

const app = express();
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
  'public/index.html',
  'public/login.html',
  'public/dashboard.html',
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
    users.set(username.toLowerCase(), { username, password: hashPassword(password) });
    saveUsers(users);
    const token = createSession(username);
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    res.json({ success: true });
});

app.post('/auth', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Username and password are required.' });
    const user = users.get(username.toLowerCase());
    if (!user || user.password !== hashPassword(password)) {
        return res.json({ success: false, error: 'Incorrect username or password.' });
    }
    const token = createSession(user.username);
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    res.json({ success: true });
});

app.get('/session', (req, res) => {
    const s = getSession(req);
    res.json({ tier: s ? s.tier : null, username: s ? s.username : null });
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
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        clientList.push(res);
        req.on('close', () => {
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

app.post('/ping', (req, res) => {
    const { id } = req.body;
    if (id) activeViewers.set(id, Date.now());
    const cutoff = Date.now() - 60000;
    for (const [key, ts] of activeViewers.entries()) {
        if (ts < cutoff) activeViewers.delete(key);
    }
    res.json({ count: activeViewers.size });
});

app.post('/leave', (req, res) => {
    const { id } = req.body;
    if (id) activeViewers.delete(id);
    res.sendStatus(204);
});

app.get('/viewers', (req, res) => {
    const cutoff = Date.now() - 60000;
    for (const [key, ts] of activeViewers.entries()) {
        if (ts < cutoff) activeViewers.delete(key);
    }
    res.json({ count: activeViewers.size });
});

if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Kahootinator 3.0 running on port ${PORT}`);
    });
}

module.exports = app;
