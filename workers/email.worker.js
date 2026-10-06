require('dotenv').config();
const { Worker } = require('bullmq');
const connection = require('../config/bullmq');
const transporter = require('../config/mailer');

const emailWorker = new Worker(
  'emailQueue',
  async (job) => {
    const { to, type, link, orderId, totalAmount, items } = job.data;
    console.log(`[Worker] Processing ${job.name} (Job ID: ${job.id}) for ${to}`);

    let subject = '';
    let html = '';

    // Check by type or job.name
    if (type === 'verification' || job.name === 'verification') {
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
    } else if (type === 'passwordReset' || job.name === 'passwordReset') {
      subject = 'Reset Your Password';
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Reset Your Password</h2>
          <p>We received a request to reset your password. Click the link below to set a new password:</p>
          <p><a href="${link}" style="display:inline-block;padding:10px 20px;background-color:#dc3545;color:#fff;text-decoration:none;border-radius:4px;">Reset Password</a></p>
          <p>Or copy this URL into your browser: <br>${link}</p>
          <p>This link expires in 15 minutes. If you did not request this, you can ignore this email.</p>
        </div>
      `;
    } else if (
      type === 'orderConfirmation' ||
      job.name === 'sendOrderConfirmationEmail' ||
      job.name === 'orderConfirmation'
    ) {
      subject = `Order Confirmation #${orderId}`;

      // Build item rows if items array is passed
      const itemsList = Array.isArray(items) && items.length > 0
        ? items.map(item => `<li>Product ID ${item.productId}: ${item.quantity} × ₹${(item.priceAtPurchase / 100).toFixed(2)}</li>`).join('')
        : '';

      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;"> 
          <h2 style="color: #2c3e50;">Order Confirmation</h2>
          <p>Thank you for your order! Your order has been placed successfully.</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <p style="margin: 4px 0;"><strong>Order ID:</strong> #${orderId}</p>
            <p style="margin: 4px 0;"><strong>Total Amount:</strong> ₹${((totalAmount || 0) / 100).toFixed(2)}</p>
          </div>
          ${itemsList ? `<p><strong>Items:</strong></p><ul>${itemsList}</ul>` : ''}
          <p>We'll notify you once your items are shipped.</p>
        </div>
      `;
    }

    if (!subject || !html) {
      console.warn(`[Worker] Warning: No template matched for job "${job.name}" / type "${type}"`);
      return;
    }

    // Send email via Nodemailer
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
    concurrency: 5,
  }
);

emailWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
});

module.exports = emailWorker;