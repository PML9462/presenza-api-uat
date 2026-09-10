const nodemailer = require('nodemailer');
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../../.env") });

/* -------------------- Transporter -------------------- */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* -------------------- Verify Transporter -------------------- */
transporter.verify((error) => {
  if (error) {
    console.error('❌ Email service not ready:', error);
  } else {
  }
});

/* -------------------- Send Email -------------------- */
const sendEmail = async (to, subject, text, html = null) => {
  try {
    const mailOptions = {
      from: `"Paul Presenza" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      text,
      html,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw new Error('Email delivery failed');
  }
};

module.exports = sendEmail;
