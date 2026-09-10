const mongoose = require("mongoose");


const leaveBalanceSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Employee",
        required: true
    },

    leaveTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LeaveType",
        required: true
    },

    year: {
        type: Number,
        required: true
    },

    month: {
        type: Number, // 1-12
        required: true
    },

    allocated: {
        type: Number,
        default: 0
    },

    used: {
        type: Number,
        default: 0
    },

    remaining: {
        type: Number,
        default: 0
    },
    lop: {
        type: Number,
        default: 0
    },
    deductedDays: {
        type: [Number],
        default: []
    }

}, { timestamps: true });

// 🔥 Prevent duplicates
leaveBalanceSchema.index(
    { employeeId: 1, leaveTypeId: 1, year: 1, month: 1 },
    { unique: true }
);

module.exports = mongoose.model("LeaveBalance", leaveBalanceSchema);
