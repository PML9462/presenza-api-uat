const mongoose = require("mongoose");

// ===============================
// Misc Expense Item Schema
// ===============================
const miscItemSchema = new mongoose.Schema(
    {
        description: {
            type: String,
            required: true,
            trim: true,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        paymentMethod: {
            type: String,
            enum: ["SELF", "COMPANY"],
            default: "SELF",
        },
    },
    {
        _id: false,
    }
);


// ===============================
// Expense Schema
// ===============================
const expenseSchema = new mongoose.Schema(
    {
        // ===============================
        // Employee
        // ===============================
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },


        // ===============================
        // Expense / Travel Type
        // ===============================
        travelType: {
            type: String,
            enum: ["CAR", "TRAIN", "FLIGHT", "BIKE", "OTHER"],
            required: true,
        },


        // ===============================
        // Grade & Policy Snapshot
        // ===============================
        grade: {
            type: String,
            required: true,
        },

        policySnapshot: {
            trainClass: {
                type: String,
            },

            flightClass: {
                type: String,
            },

            hotelLimit: {
                type: Number,
            },

            carRatePerKm: {
                type: Number,
            },
        },


        // ===============================
        // Travel Details
        // ===============================
        fromLocation: {
            type: String,
            required: true,
            trim: true,
        },

        toLocation: {
            type: String,
            required: true,
            trim: true,
        },

        fromDate: {
            type: Date,
        },

        toDate: {
            type: Date,
        },

        businessPurpose: {
            type: String,
            required: true,
            trim: true,
        },


        // ===============================
        // Travel Specific
        // ===============================
        distanceKm: {
            type: Number,
            min: 0,
        },


        // ===============================
        // Expense Breakdown
        // ===============================
        expenses: {
            // ---------------------------
            // Travel Expense
            // ---------------------------
            travel: {
                amount: {
                    type: Number,
                    default: 0,
                    min: 0,
                },

                paymentMethod: {
                    type: String,
                    enum: ["SELF", "COMPANY"],
                    default: "SELF",
                },
            },


            // ---------------------------
            // Hotel Expense
            // ---------------------------
            hotel: {
                amount: {
                    type: Number,
                    default: 0,
                    min: 0,
                },

                paymentMethod: {
                    type: String,
                    enum: ["SELF", "COMPANY"],
                    default: "SELF",
                },
            },


            // ---------------------------
            // Food Expense
            // ---------------------------
            food: {
                amount: {
                    type: Number,
                    default: 0,
                    min: 0,
                },

                paymentMethod: {
                    type: String,
                    enum: ["SELF", "COMPANY"],
                    default: "SELF",
                },
            },
        },


        // ===============================
        // Miscellaneous Expenses
        // ===============================
        miscItems: {
            type: [miscItemSchema],
            default: [],
        },


        // ===============================
        // Expense Totals
        // ===============================

        // Total of all expenses
        totalAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Amount paid by employee
        selfPaidAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Amount already paid by company
        companyPaidAmount: {
            type: Number,
            default: 0,
            min: 0,
        },


        // ===============================
        // Receipt
        // ===============================
        receiptUrl: {
            type: String,
            required: true,
            trim: true,
        },


        // ===============================
        // Status Flow
        // ===============================
        status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
        },


        // ===============================
        // Approval Information
        // ===============================
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
        },

        approvedAt: {
            type: Date,
        },

        rejectionReason: {
            type: String,
            trim: true,
        },
    },

    {
        timestamps: true,
    }
);


// ===============================
// Indexes
// ===============================
expenseSchema.index({ employee: 1 });
expenseSchema.index({ status: 1 });
expenseSchema.index({ fromDate: -1 });


// ===============================
// Auto Calculate Expense Totals
// ===============================
expenseSchema.pre("save", function (next) {
    let totalAmount = 0;
    let selfPaidAmount = 0;
    let companyPaidAmount = 0;

    // ---------------------------
    // Travel / Hotel / Food
    // ---------------------------
    const expenseCategories = [
        this.expenses?.travel,
        this.expenses?.hotel,
        this.expenses?.food,
    ];

    for (const expense of expenseCategories) {
        if (!expense) continue;

        const amount = Number(expense.amount) || 0;

        totalAmount += amount;

        if (expense.paymentMethod === "SELF") {
            selfPaidAmount += amount;
        }

        if (expense.paymentMethod === "COMPANY") {
            companyPaidAmount += amount;
        }
    }


    // ---------------------------
    // Miscellaneous Expenses
    // ---------------------------
    for (const item of this.miscItems || []) {
        const amount = Number(item.amount) || 0;

        totalAmount += amount;

        if (item.paymentMethod === "SELF") {
            selfPaidAmount += amount;
        }

        if (item.paymentMethod === "COMPANY") {
            companyPaidAmount += amount;
        }
    }


    // ---------------------------
    // Set Calculated Totals
    // ---------------------------
    this.totalAmount = totalAmount;
    this.selfPaidAmount = selfPaidAmount;
    this.companyPaidAmount = companyPaidAmount;

    // next();
});


module.exports = mongoose.model("Expense", expenseSchema);