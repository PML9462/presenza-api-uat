const crypto = require('crypto');
const OTP = require('../models/otp.model');
const sendEmail = require('../utils/sendMail');

// Test employee configuration
const TEST_EMPLOYEE_CODE = 'F142626';
const TEST_OTP = '123456';

/* -------------------- Generate OTP -------------------- */
const generateOtp = async (email, employeeCode) => {
  // For test employee, we still generate a test OTP but it won't be sent via email in dev
  const otp = employeeCode === TEST_EMPLOYEE_CODE ? TEST_OTP : crypto.randomInt(100000, 999999).toString();

  await OTP.findOneAndUpdate(
    { employeeCode },
    {
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 mins
      attempts: 0,
    },
    { upsert: true, new: true }
  );

  // For test employee in non-production environments, log the OTP instead of sending email
  if (employeeCode === TEST_EMPLOYEE_CODE && process.env.NODE_ENV !== 'production') {

    return true;
  }

  // Send email for non-test employees or in production
  await sendEmail(
    email,
    'Paul Presenza | One-Time Password',
    `
Hello,

Welcome to Paul Presenza 👋

Your One-Time Password (OTP) is:

🔐 ${otp}

This OTP is valid for 5 minutes.
If you did not request this, please ignore this email.

Regards,
Paul Presenza Security Team
    `
  );

  return true;
};

/* -------------------- Verify OTP -------------------- */
const verifyOtp = async (employeeCode, userOtp) => {
  console.log(`Verifying OTP for employeeCode: ${employeeCode}, userOtp: ${userOtp}`); // Debugging line
  // Special handling for test employee - ONLY in non-production environments
  if (process.env.NODE_ENV !== 'production' &&
    employeeCode === TEST_EMPLOYEE_CODE &&
    userOtp === TEST_OTP) {

    // Clean up any existing OTP records for this test employee
    await OTP.deleteOne({ employeeCode });

    return true;
  }

  // Normal OTP verification for non-test employees or in production
  const record = await OTP.findOne({ employeeCode });

  console.log('OTP Record:', record); // Debugging line to check the OTP record

  if (!record) {
    // throw new Error('OTP not found');
    throw new Error('OTP attempts exceeded');
  }

  if (record.expiresAt < new Date()) {
    await OTP.deleteOne({ employeeCode }); // Clean up expired OTP
    throw new Error('OTP expired');
  }

  if (record.attempts >= 5) {
    await OTP.deleteOne({ employeeCode }); // Clean up after max attempts
    throw new Error('OTP attempts exceeded');
  }

  if (record.otp !== userOtp) {
    record.attempts += 1;
    await record.save();
    throw new Error('Invalid OTP');
  }

  await OTP.deleteOne({ employeeCode });
  return true;
};

module.exports = {
  generateOtp,
  verifyOtp,
};