const mongoose = require("mongoose");

const leaveTypeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    code: {
        type: String,
        required: true,
        unique: true // SL, CL, EL
    },

    description: {
        type: String
    },

    yearlyQuota: {
        type: Number,
        default: 0
    },

    carryForward: {
        type: Boolean,
        default: false
    },

    maxCarryForward: {
        type: Number,
        default: 0
    },

    isPaid: {
        type: Boolean,
        default: true
    },

    accrualType: {
        type: String,
        enum: ["YEARLY", "MONTHLY"],
        default: "YEARLY"
    },

    accrualRate: {
        type: Number, // e.g. 2.5 per month
        default: 0
    },

    // 🔥 NEW: Custom Rules (for 3.5 logic etc)
    customRules: {
        type: Object,
        default: null
        /*
        Example:
        {
          type: "EVERY_N_MONTH",
          value: 2,
          leave: 3.5
        }
        */
    },

    isActive: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

module.exports = mongoose.model("LeaveType", leaveTypeSchema);