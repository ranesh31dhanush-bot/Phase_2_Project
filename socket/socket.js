// socket/socket.js
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');

let io = null;

const initSocket = async (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // 1. Setup Redis Pub/Sub Clients for Multi-Instance Cross-Talk
  const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => console.error('[Redis PubClient Error]', err));
  subClient.on('error', (err) => console.error('[Redis SubClient Error]', err));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  console.log(`[Socket.io] Redis Adapter connected on port ${process.env.PORT || 3000}`);

  // Log all outgoing events from this instance
  io.of("/").adapter.on("create-room", (room) => {
    console.log(`[Redis Adapter - Port ${process.env.PORT || 3000}] Room created: ${room}`);
  });
  io.of("/").adapter.on("join-room", (room, id) => {
    console.log(`[Redis Adapter - Port ${process.env.PORT || 3000}] Socket ${id} joined ${room}`);
  });

  // 2. Authentication Middleware
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const secret = process.env.JWT_ACCESS_SECRET || 'test_access_secret_12345';
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });

      const userId = decoded.userId || decoded.id || decoded._id || decoded.sub;
      if (!userId) {
        return next(new Error('Authentication error: Missing user identifier in token'));
      }

      socket.user = {
        userId: userId.toString(),
        email: decoded.email,
        role: decoded.role,
      };

      next();
    } catch (err) {
      console.error('[Socket.io] Auth error:', err.message);
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  // 3. User Connection and Private Room Assignment
  io.on('connection', async (socket) => {
    const userId = socket.user.userId;
    const userRoom = `user:${userId}`;

    await socket.join(userRoom);
    console.log(`[Socket.io] Instance [Port ${process.env.PORT || 3000}] User ${userId} joined room [${userRoom}]`);

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] User ${userId} disconnected (${reason})`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized yet!');
  }
  return io;
};

module.exports = { initSocket, getIO };