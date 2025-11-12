const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Отдаём статику из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Отдаём index.html для любых маршрутов (SPA-friendly)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Простое in-memory хранилище пользователей (userId -> { socketId, nick, avatar, username })
const users = {};

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  // При входе клиент отправляет { userId, nick, avatar, username }
  socket.on('join', (payload) => {
    try {
      if (!payload || !payload.userId) return;
      users[payload.userId] = {
        socketId: socket.id,
        nick: payload.nick || 'Гость',
        avatar: payload.avatar || null,
        username: payload.username || null
      };
      socket.data.userId = payload.userId;
      socket.data.nick = payload.nick;
      socket.data.username = payload.username;
      console.log(`✅ ${payload.nick} (${payload.userId}) connected`);
    } catch (e) {
      console.error('join error', e);
    }
  });

  // Глобальные сообщения (если нужно)
  socket.on('message', (msg) => {
    const payload = {
      id: socket.id,
      nick: socket.data.nick || 'Гость',
      text: msg,
      time: Date.now(),
    };
    io.emit('message', payload);
  });

  // Поиск пользователя по username или userId
  socket.on('findUser', (query, callback) => {
    try {
      if (!query) return callback({ success: false });
      // normalize: allow searching with or without @
      const q = query.replace(/^@/, '');
      // search by userId exact
      if (users[q]) {
        return callback({ success: true, user: { userId: q, ...users[q] } });
      }
      // search by username
      const found = Object.entries(users).find(([uid, u]) => (u.username && u.username === q));
      if (found) {
        const [uid, u] = found;
        return callback({ success: true, user: { userId: uid, ...u } });
      }
      return callback({ success: false });
    } catch (e) {
      console.error('findUser error', e);
      return callback({ success: false });
    }
  });

  // Личные сообщения
  socket.on('privateMessage', ({ toUserId, text }) => {
    try {
      const from = socket.data.userId;
      if (!from || !toUserId) return;
      if (!users[toUserId]) return;
      const toSocketId = users[toUserId].socketId;
      const msg = {
        from: { userId: from, nick: socket.data.nick },
        text,
        time: Date.now(),
      };
      io.to(toSocketId).emit('privateMessage', msg);
      socket.emit('privateMessage', msg); // echo back to sender
    } catch (e) {
      console.error('privateMessage error', e);
    }
  });

  socket.on('disconnect', () => {
    const uid = socket.data.userId;
    if (uid && users[uid]) {
      console.log(`❌ ${users[uid].nick} (${uid}) disconnected`);
      delete users[uid];
    }
  });
});

server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
