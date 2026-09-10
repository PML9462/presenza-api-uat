// models/shiftPolicy.model.js
const mongoose = require("mongoose");

const shiftPolicySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
      default: "09:30",
    },
    endTime: {
      type: String,
      required: true,
      default: "18:30",
    },
    firstHalfEndTime: {
      type: String,
      required: true,
      default: "13:30",
    },
    secondHalfStartTime: {
      type: String,
      required: true,
      default: "14:30",
    },
    minimumFullDayMinutes: {
      type: Number,
      required: true,
      default: 480, // 8 hours
    },
    minimumHalfDayMinutes: {
      type: Number,
      required: true,
      default: 240, // 4 hours
    },
    graceLateMinutes: {
      type: Number,
      default: 15,
    },
    maxLateAllowedPerMonth: {
      type: Number,
      default: 3,
    },
    maxShortLeaveMinutes: {
      type: Number,
      default: 120,
    },
    autoPunchOut: {
      type: Boolean,
      default: true,
    },
    weeklyOffPolicy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeeklyOffPolicy",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShiftPolicy", shiftPolicySchema);