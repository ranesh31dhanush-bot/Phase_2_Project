require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const { initSocket } = require('./socket/socket');

const normalizeMongoUri = (uri) => {
  if (!uri) return 'mongodb://127.0.0.1:27017/Phase_2_project';
  return uri
    .replace('mongodb://localhost', 'mongodb://127.0.0.1')
    .replace('mongodb://[::1]', 'mongodb://127.0.0.1');
};

const port = process.env.PORT || 3000;
const server = http.createServer(app);

const startServer = async () => {
  try {
    const MONGO_URI = normalizeMongoUri(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Phase_2_project');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Initialize Socket.io with Redis Adapter
    const io = await initSocket(server);
    app.set('io', io);

    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();