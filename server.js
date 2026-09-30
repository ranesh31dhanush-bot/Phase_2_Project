// server.js
require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const normalizeMongoUri = (uri) => {
  if (!uri) return 'mongodb://127.0.0.1:27017/Phase_2_project';
  return uri
    .replace('mongodb://localhost', 'mongodb://127.0.0.1')
    .replace('mongodb://[::1]', 'mongodb://127.0.0.1');
};

const port = process.env.PORT || 3000;
const MONGO_URI = normalizeMongoUri(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Phase_2_project');

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });