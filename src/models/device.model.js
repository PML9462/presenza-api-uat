const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },

    deviceId: {
      type: String,
      required: true,
      index: true,
    },

    platform: {
      type: String,
      enum: ['android', 'ios', 'web', 'windows', 'mac'],
    },

    appVersion: String,
    osVersion: String,
    fcmToken: String,

    isTrusted: {
      type: Boolean,
      default: false,
    },

    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* Unique device per employee */
deviceSchema.index({ employee: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('Device', deviceSchema);
