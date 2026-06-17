import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();
const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpPort === 465, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: { rejectUnauthorized: false }
});

export default transporter;
