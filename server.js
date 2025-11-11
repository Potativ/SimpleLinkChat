const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify({}), 'utf8');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- simple persistent helpers ---
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return {}; }
}
function writeUsers(u){ fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2), 'utf8'); }
function readMessages() {
  try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); } catch { return {}; }
}
function writeMessages(m){ fs.writeFileSync(MESSAGES_FILE, JSON.stringify(m, null, 2), 'utf8'); }

// --- utility ---
function makeChatKey(a,b){ return [a,b].sort().join('|'); }
function validUsername(v){ return /^[a-zA-Z0-9_]+$/.test(v); }

// --- API: register / login / search users ---
app.post('/api/register', async (req, res) => {
  const { email, password, nick, username } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const users = readUsers();
  // ensure unique username - if none provided, create one
  let uname = username && validUsername(username) ? username : null;
  if (!uname) {
    // generate simple username
    let i = 0;
    do {
      uname = 'user' + Math.floor(1000 + Math.random()*9000);
      i++;
      if (i>100) break;
    } while (users[uname]);
  } else {
    if (users[uname]) return res.status(400).json({ error: 'Username taken' });
  }
  // ensure unique email
  for (const u of Object.values(users)) if (u.email === email) return res.status(400).json({ error: 'Email exists' });
  const hash = await bcrypt.hash(password, 8);
  users[uname] = { email, passwordHash: hash, nick: nick || uname, avatar: null, lastUsernameChange: Date.now() };
  writeUsers(users);
  // respond with user object (without password)
  const out = { username: uname, nick: users[uname].nick, avatar: users[uname].avatar };
  return res.json({ ok: true, user: out });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const users = readUsers();
  const entry = Object.entries(users).find(([k,v]) => v.email === email);
  if (!entry) return res.status(400).json({ error: 'No such user' });
  const [username, user] = entry;
  const match = await bcrypt.compare(password, user.passwordHash || '');
  if (!match) return res.status(400).json({ error: 'Wrong password' });
  return res.json({ ok: true, user: { username, nick: user.nick, avatar: user.avatar } });
});

// search by username substring
app.get('/api/users', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const users = readUsers();
  const list = Object.entries(users)
    .filter(([uname,u]) => uname.toLowerCase().includes(q) || (u.nick||'').toLowerCase().includes(q))
    .map(([uname,u]) => ({ username: uname, nick: u.nick, avatar: u.avatar }));
  res.json({ results: list });
});

// get messages for chat between two users
app.get('/api/messages', (req, res) => {
  const a = req.query.a, b = req.query.b;
  if (!a || !b) return res.status(400).json({ error: 'a and b required' });
  const key = makeChatKey(a,b);
  const messages = readMessages();
  res.json({ messages: messages[key] || [] });
});

// serve
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

// --- Socket.IO real-time ---
const online = {}; // username -> socket.id
io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('register_socket', (profile) => {
    if (!profile || !profile.username) return;
    online[profile.username] = socket.id;
    socket.data.username = profile.username;
    console.log('socket register', profile.username);
  });

  socket.on('send_private', (data) => {
    const { from, to, text } = data;
    if (!from || !to || !text) return;
    // persist
    const messages = readMessages();
    const key = makeChatKey(from,to);
    if (!messages[key]) messages[key] = [];
    const msg = { id: Date.now().toString(36)+Math.random().toString(36).slice(2,6), from, text, time: Date.now() };
    messages[key].push(msg);
    writeMessages(messages);
    // emit to recipient if online
    if (online[to]) io.to(online[to]).emit('receive_private', msg);
    // also emit to sender socket (ack)
    if (online[from]) io.to(online[from]).emit('receive_private', msg);
  });

  socket.on('disconnect', () => {
    const u = socket.data.username;
    if (u && online[u]) delete online[u];
    console.log('disconnected', socket.id, u);
  });
});

server.listen(PORT, () => console.log('Server listening on', PORT));