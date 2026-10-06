const {Queue} = require('bullmq');
const connection = require('../config/bullmq');

const emailQueue = new Queue('emailQueue', {
    connection,
    defaultJobOptions: {
        attempts: 3, // Number of retry attempts
        backoff: {
            type: 'exponential', // Exponential backoff strategy
            delay: 5000, // Initial delay in milliseconds
        },
        removeOnComplete: true,
        removeOnFail: {
            count: 10, // Number of failed attempts before removing the job
        },
    },
});

const addVerificationEmailJob = async (to, link) => {
    return emailQueue.add('sendVerificationEmail', {
        to,
        type: 'verification',
        link,
    });
};

const addPasswordResetEmailJob = async (to, link) => {
    return emailQueue.add('sendPasswordResetEmail', {
        to,
        type: 'passwordReset',
        link,
    });
};

const addOrderConfirmationEmailJob = async (to, orderId, totalAmount, items = []) => {
  return emailQueue.add('sendOrderConfirmationEmail', {
    to,
    orderId,
    totalAmount,
    items,
  });
};


module.exports = {
    emailQueue,
    addVerificationEmailJob,
    addPasswordResetEmailJob,
    addOrderConfirmationEmailJob,
};
