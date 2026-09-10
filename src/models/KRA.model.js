const mongoose = require("mongoose");

const kraSchema = new mongoose.Schema(
    {

        batchId: {
            type: String,
            index: true,
        },
        title: {
            type: String,
            // required: true,
        },

        description: String,

        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },

        departmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
        },

        managerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
        },

        period: {
            type: String,
            enum: ["monthly", "quarterly", "yearly"],
            default: "quarterly",
        },

        metrics: [
            {
                category: { type: String, required: true },
                name: { type: String, required: true },
                target: { type: Number, required: true },
                achieved: { type: Number, default: 0 },
                weightage: { type: Number, required: true },

                score: { type: Number, default: 0 },

                status: {
                    type: String,
                    enum: ["pending", "in_progress", "completed"],
                    default: "pending",
                },
            },
        ],

        totalScore: {
            type: Number,
            default: 0,
        },

        status: {
            type: String,
            enum: ["pending", "in_progress", "completed", "approved"],
            default: "pending",
        },

        startDate: Date,
        endDate: Date,
    },
    { timestamps: true }
);

// Index (important)
kraSchema.index({ employeeId: 1, period: 1 });

module.exports = mongoose.model("KRA", kraSchema);