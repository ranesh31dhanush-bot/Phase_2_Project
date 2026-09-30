require('dotenv').config();
const { Worker } = require('bullmq');
const connection = require('../config/bullmq');
const transporter = require('../config/mailer');

const emailWorker = new Worker(
  'emailQueue',
  async (job) => {
    const { to, type, link } = job.data;
    console.log(`[Worker] Processing ${job.name} (Job ID: ${job.id}) for ${to}`);

    let subject = '';
    let html = '';

    if (type === 'verification') {
      subject = 'Verify Your Email Address';
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Verify Your Email</h2>
          <p>Thank you for signing up. Please verify your account by clicking the link below:</p>
          <p><a href="${link}" style="display:inline-block;padding:10px 20px;background-color:#007bff;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a></p>
          <p>Or copy this URL into your browser: <br>${link}</p>
          <p>This link expires in 24 hours.</p>
        </div>
      `;
    } else if (type === 'passwordReset') {
      subject = 'Reset Your Password';
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Password Reset Request</h2>
          <p>We received a request to reset your password. Click the link below to set a new password:</p>
          <p><a href="${link}" style="display:inline-block;padding:10px 20px;background-color:#dc3545;color:#fff;text-decoration:none;border-radius:4px;">Reset Password</a></p>
          <p>Or copy this URL into your browser: <br>${link}</p>
          <p>This link expires in 15 minutes. If you did not request this, you can ignore this email.</p>
        </div>
      `;
    }

    // Send the email via Nodemailer + Mailtrap
    await transporter.sendMail({
      from: process.env.MAIL_FROM || '"Auth System" <no-reply@authsystem.com>',
      to,
      subject,
      html,
    });

    console.log(`[Worker] Email sent successfully to ${to}`);
  },
  {
    connection,
    concurrency: 5, // Process up to 5 email jobs simultaneously
  }
);

emailWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
});

module.exports = emailWorker;