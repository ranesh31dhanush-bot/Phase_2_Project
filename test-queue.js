require('dotenv').config();
const { addVerificationEmailJob } = require('./queues/email.queue');

(async () => {
  console.log('Dispatching test verification email job...');
  await addVerificationEmailJob('testuser@example.com', 'http://localhost:3000/auth/verify/sampletoken123');
  console.log('Job dispatched to BullMQ. Check worker logs and Mailtrap!');
  process.exit(0);
})();