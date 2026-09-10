const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    employeeCode: {
      type: String,
      required: true,
      index: true,
    },

    otp: {
      type: String,
      required: true,
    },

    purpose: {
      type: String,
      enum: ['LOGIN', 'RESET_MPIN'],
      default: 'LOGIN',
    },

    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index
    },

    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('Otp', otpSchema);
