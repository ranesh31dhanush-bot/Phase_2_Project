// scripts/seedAdmin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // or bcrypt
const User = require('../models/User'); // adjust path if different
require('dotenv').config();

const seedAdmin = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/auth_db';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const adminEmail = 'admin@gmail.com';
    const plainPassword = 'Admin@123';

    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      existingAdmin.role = 'admin';
      existingAdmin.isVerified = true;
      await existingAdmin.save();
      console.log('Existing user updated to admin role.');
    } else {
      const passwordHash = await bcrypt.hash(plainPassword, 10);
      await User.create({
        email: adminEmail,
        passwordHash,
        role: 'admin',
        isVerified: true,
        authProvider: 'local',
      });
      console.log(`Admin user created: ${adminEmail} / ${plainPassword}`);
    }
  } catch (error) {
    console.error('Failed to seed admin:', error);
  } finally {
    await mongoose.disconnect();
  }
};

seedAdmin();