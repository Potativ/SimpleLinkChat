const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Говорим Express отдавать всё из папки public
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  socket.on('join', (nick) => {
    socket.data.nick = nick || 'Гость';
    socket.broadcast.emit('system', `${socket.data.nick} подключился`);
  });

  socket.on('message', (msg) => {
    const payload = {
      id: socket.id,
      nick: socket.data.nick || 'Гость',
      text: msg,
      time: Date.now(),
    };
    io.emit('message', payload);
  });

  socket.on('disconnect', () => {
    if (socket.data.nick) {
      socket.broadcast.emit('system', `${socket.data.nick} вышел`);
    }
    console.log('disconnected:', socket.id);
  });
});

server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
