const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Отдаём статику из /public
app.use(express.static(path.join(__dirname, 'public')));

// 🔹 Хранилище пользователей
// userId -> { socketId, nick, avatar }
const users = {};

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  // 📥 При входе пользователь сообщает свой userId и nick
  socket.on('join', ({ userId, nick, avatar }) => {
    if (!userId) return;

    users[userId] = {
      socketId: socket.id,
      nick: nick || 'Гость',
      avatar: avatar || null,
    };

    socket.data.userId = userId;
    socket.data.nick = nick;
    console.log(`✅ ${nick} (${userId}) подключился`);
  });

  // 📤 Отправка обычного сообщения в общий чат
  socket.on('message', (msg) => {
    const payload = {
      id: socket.id,
      nick: socket.data.nick || 'Гость',
      text: msg,
      time: Date.now(),
    };
    io.emit('message', payload);
  });

  // 📩 Поиск пользователя по userId
  socket.on('findUser', (query, callback) => {
    const found = Object.entries(users).find(([uid]) => uid === query);
    if (found) {
      const [uid, user] = found;
      callback({ success: true, user: { userId: uid, ...user } });
    } else {
      callback({ success: false });
    }
  });

  // 💬 Отправка личного сообщения
  socket.on('privateMessage', ({ toUserId, text }) => {
    const from = socket.data.userId;
    if (!from || !users[toUserId]) return;

    const toSocketId = users[toUserId].socketId;
    const msg = {
      from: { userId: from, nick: socket.data.nick },
      text,
      time: Date.now(),
    };

    io.to(toSocketId).emit('privateMessage', msg);
    socket.emit('privateMessage', msg); // отправителю тоже
  });

  // ❌ При отключении — удалить из памяти
  socket.on('disconnect', () => {
    const uid = socket.data.userId;
    if (uid && users[uid]) {
      console.log(`❌ ${users[uid].nick} (${uid}) отключился`);
      delete users[uid];
    }
  });
});

server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
