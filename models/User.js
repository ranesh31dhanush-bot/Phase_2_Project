const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // Basic email validation
    },
    passwordHash: {
        type: String,
        default: null,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    emailVerificationTokenHash: {
        type: String,
        default: null,
    },
    emailVerificationExpiresAt: {
        type: Date,
        default: null,
    },
    passwordResetTokenHash: {
        type: String,
        default: null,
    },
    passwordResetExpiresAt: {
        type: Date,
        default: null,  
    },
    googleId: {
        type: String,
        default: null,  
    },
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local',
    },

}, { timestamps: true });   


module.exports = mongoose.model('User', userSchema);