const mongoose = require("mongoose");

const AttendanceRegularizationSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true,
        },

        attendanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Attendance",
            required: true,
            index: true,
        },


        requestType: {
            type: String,
            enum: [
                "MISSING_PUNCH_IN",
                "MISSING_PUNCH_OUT",
                "MISSING_BOTH",
                "WRONG_PUNCH_TIME",
                "ABSENT_MARKED"
            ],
            required: true,
        },
        attendanceDate: {
            type: Date,
            required: true,
            index: true,
        },

        // Employee requested timings
        requestedPunchIn: {
            type: Date,
            default: null,
        },

        requestedPunchOut: {
            type: Date,
            default: null,
        },

        reason: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },

        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
            default: "PENDING",
            index: true,
        },

        // RM Details
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },

        approvalRemark: {
            type: String,
            default: null,
            trim: true,
        },

        approvedPunchIn: {
            type: Date,
            default: null,
        },

        approvedPunchOut: {
            type: Date,
            default: null,
        },

        approvedAt: {
            type: Date,
            default: null,
        },

        rejectedAt: {
            type: Date,
            default: null,
        },

        cancelledAt: {
            type: Date,
            default: null,
        },

        isLeaveAdjusted: {
            type: Boolean,
            default: false,
        },

        leaveAdjustmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LeaveTransaction",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

AttendanceRegularizationSchema.index(
    {
        employeeId: 1,
        attendanceDate: 1,
        status: 1,
    }
);

module.exports = mongoose.model(
    "AttendanceRegularization",
    AttendanceRegularizationSchema
);