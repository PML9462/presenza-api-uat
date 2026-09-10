const mongoose = require("mongoose");

const leaveSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },

        startDate: {
            type: Date,
            required: true,
        },

        endDate: {
            type: Date,
            // required: true,
        },

        leaveType: {
            type: String,
            enum: ["FULL_DAY", "FIRST_HALF", "SECOND_HALF", "FIRST_HALF_SHORT_LEAVE", "SECOND_HALF_SHORT_LEAVE"],
            required: true,
        },

        reason: String,

        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
        },

        // 👇 NEW FIELDS
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
        },

        approvedAt: {
            type: Date,
        },

        rejectionReason: {
            type: String,
        },
        leaveBalanceDeducted: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Leave", leaveSchema);