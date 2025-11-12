const express = require('express'); 
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Отдаём статику из public
app.use(express.static(path.join(__dirname, 'public')));

// Если пользователь зашёл по адресу, отдать index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
