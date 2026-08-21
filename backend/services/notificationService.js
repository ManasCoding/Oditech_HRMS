import nodemailer from 'nodemailer';

// Create a nodemailer transporter using environment variables
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: true, // true for port 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

export const sendEmail = async (to, subject, htmlBody) => {
  if (!to || !to.includes('@')) throw new Error('Invalid email address');

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: `"HR Department" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: htmlBody
  });

  console.log(`[Email Sent] To: ${to} | MessageId: ${info.messageId}`);
  return { success: true, messageId: info.messageId };
};
