// const mongoose = require("mongoose");

// /**
//  * =============================
//  * Break Schema
//  * =============================
//  */
// const breakSchema = new mongoose.Schema(
//     {
//         breakIn: {
//             type: Date,
//             required: true,
//         },
//         breakOut: {
//             type: Date,
//         },
//         durationMinutes: {
//             type: Number,
//             default: 0,
//         },
//         breakType: {
//             type: String,
//             enum: [
//                 "TEA",
//                 "LUNCH",
//                 "PERSONAL",
//                 "OTHER",
//                 // 🔹 Sales / LAP Activities
//                 "SALES_MEETING",
//                 "FOLLOWUP",
//                 "DEMO",
//                 "COLLECTION"
//             ],
//             default: "OTHER",
//         },
//         remarks: {
//             type: String,
//         },
//     },
//     { _id: false }
// );


// const visitSchema = new mongoose.Schema(
//     {
//         visitType: {
//             type: String,
//             enum: [
//                 "CLIENT_VISIT",
//                 "DEMO",
//                 "FOLLOW_UP",
//                 "COLLECTION",
//                 "SITE_VISIT",
//                 "MARKET_VISIT",
//                 "OTHER"
//             ],
//             default: "CLIENT_VISIT"
//         },



//         customerName: String,

//         visitIn: {
//             type: Date,
//             required: true,
//         },

//         visitOut: Date,

//         durationMinutes: {
//             type: Number,
//             default: 0,
//         },

//         status: {
//             type: String,
//             enum: [
//                 "IN_PROGRESS",
//                 "COMPLETED",
//                 "CANCELLED"
//             ],
//             default: "IN_PROGRESS"
//         },

//         purpose: String,

//         remarks: String,

//         punchInLocation: {
//             latitude: Number,
//             longitude: Number,
//             address: String,
//             imageUrl: String,
//         },

//         punchOutLocation: {
//             latitude: Number,
//             longitude: Number,
//             address: String,
//             imageUrl: String,
//         },

//         distanceFromOffice: Number,

//         outcome: {
//             type: String,
//             enum: [
//                 "SUCCESS",
//                 "NOT_AVAILABLE",
//                 "FOLLOWUP_REQUIRED",
//                 "NO_RESPONSE"
//             ]
//         }
//     },
//     { _id: false }
// );

// /**
//  * =============================
//  * Session Schema
//  * =============================
//  */
// const sessionSchema = new mongoose.Schema(
//     {
//         punchIn: {
//             type: Date,
//             required: true,
//         },
//         punchOut: {
//             type: Date,
//         },
//         durationMinutes: {
//             type: Number,
//             default: 0,
//         },
//         breaks: {
//             type: [breakSchema],
//             default: [],
//         },
//         visits: {
//             type: [visitSchema],
//             default: [],
//         },
//         punchInLocation: {
//             latitude: Number,
//             longitude: Number,
//             address: String,
//             imageUrl: String,
//         },
//         punchOutLocation: {
//             latitude: Number,
//             longitude: Number,
//             address: String,
//             imageUrl: String,
//         },
//         // Auto punch out tracking
//         autoPunchedOut: {
//             type: Boolean,
//             default: false,
//         },
//         manualPunchedOut: {
//             type: Boolean,
//             default: false,
//         },
//     },
//     { _id: false }
// );

// /**
//  * =============================
//  * Short Leave Sub-schema
//  * =============================
//  */
// const shortLeaveSchema = new mongoose.Schema({
//     isShortLeave: { type: Boolean, default: false },
//     minutes: { type: Number, default: 0 },
//     startTime: Date,
//     endTime: Date,
//     reason: { type: String },
// }, { _id: false });

// /**
//  * =============================
//  * Core Status Schema (stores first punch status)
//  * =============================
//  */
// const coreStatusSchema = new mongoose.Schema({
//     attendanceStatus: {
//         type: String,
//         enum: ["PRESENT", "SHORT_LEAVE", "HALF_DAY", "ABSENT", "HOLIDAY", "WEEK_OFF", "ON_LEAVE"],
//     },
//     isHalfDay: { type: Boolean, default: false },
//     halfDayType: {
//         type: String,
//         enum: ["FIRST_HALF", "SECOND_HALF"],
//     },
//     morningShortLeave: {
//         type: shortLeaveSchema,
//         default: () => ({}),
//     },
//     isLate: { type: Boolean, default: false },
//     lateMinutes: { type: Number, default: 0 },
// }, { _id: false });

// /**
//  * =============================
//  * Attendance Schema
//  * =============================
//  */
// const attendanceSchema = new mongoose.Schema(
//     {
//         employee: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Employee",
//             required: true,
//             index: true,
//         },
//         date: {
//             type: Date,
//             required: true,
//             index: true,
//         },
//         sessions: {
//             type: [sessionSchema],
//             default: [],
//         },
//         firstPunchIn: {
//             type: Date,
//         },
//         lastPunchOut: {
//             type: Date,
//         },
//         totalWorkingMinutes: {
//             type: Number,
//             default: 0,
//         },
//         totalBreakMinutes: {
//             type: Number,
//             default: 0,
//         },
//         breakCount: {
//             type: Number,
//             default: 0,
//         },

//         // Late Tracking
//         isLate: {
//             type: Boolean,
//             default: false,
//         },
//         lateMinutes: {
//             type: Number,
//             default: 0,
//         },

//         // Early Leave Tracking
//         isEarlyLeave: {
//             type: Boolean,
//             default: false,
//         },
//         earlyLeaveMinutes: {
//             type: Number,
//             default: 0,
//         },

//         // Short Leave Tracking
//         morningShortLeave: {
//             type: shortLeaveSchema,
//             default: () => ({}),
//         },
//         eveningShortLeave: {
//             type: shortLeaveSchema,
//             default: () => ({}),
//         },

//         // Half Day Tracking
//         isHalfDay: {
//             type: Boolean,
//             default: false,
//         },
//         halfDayType: {
//             type: String,
//             enum: ["FIRST_HALF", "SECOND_HALF"],
//         },

//         // ====================================================================
//         // CORE STATUS FIELDS - Stores first punch status (persists across saves)
//         // These are CRITICAL for the evaluator to work correctly
//         // ====================================================================
//         coreAttendanceStatus: {
//             type: String,
//             enum: ["PRESENT", "SHORT_LEAVE", "HALF_DAY", "ABSENT", "HOLIDAY", "WEEK_OFF", "ON_LEAVE"],
//         },
//         coreIsHalfDay: {
//             type: Boolean,
//             default: false,
//         },
//         coreHalfDayType: {
//             type: String,
//             enum: ["FIRST_HALF", "SECOND_HALF"],
//         },
//         coreMorningShortLeave: {
//             type: shortLeaveSchema,
//             default: () => ({}),
//         },
//         coreIsLate: {
//             type: Boolean,
//             default: false,
//         },
//         coreLateMinutes: {
//             type: Number,
//             default: 0,
//         },

//         // ====================================================================
//         // STATUS FIELDS
//         // ====================================================================
//         // Real-time punch state (PRESENT when punched in, ABSENT when punched out)
//         status: {
//             type: String,
//             enum: ["PRESENT", "ABSENT"],
//             default: "ABSENT",
//         },

//         // Final HR verdict
//         attendanceStatus: {
//             type: String,
//             enum: [
//                 "PRESENT",
//                 "HALF_DAY",
//                 "SHORT_LEAVE",
//                 "ABSENT",
//                 "WEEK_OFF",
//                 "HOLIDAY",
//                 "ON_LEAVE",
//             ],
//             default: "ABSENT",
//         },

//         leaveReference: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Leave",
//         },
//         evaluationSource: {
//             type: String,
//             enum: ["SYSTEM", "MANUAL_OVERRIDE"],
//             default: "SYSTEM",
//         },
//         remarks: {
//             type: String,
//         },

//         regularized: {
//             type: Boolean,
//             default: false,
//         },

//         regularizationRequestId: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "AttendanceRegularization",
//             default: null,
//         },

//         regularizedAt: {
//             type: Date,
//             default: null,
//         },

//         regularizedBy: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Employee",
//             default: null,
//         },
//     },
//     { timestamps: true }
// );

// // Ensure one attendance per employee per day
// attendanceSchema.index(
//     { employee: 1, date: 1 },
//     { unique: true }
// );

// // Index for faster queries on core status
// attendanceSchema.index({ employee: 1, coreAttendanceStatus: 1 });

// // Index for date range queries
// attendanceSchema.index({ date: -1, employee: 1 });

// module.exports = mongoose.model("Attendance", attendanceSchema);




const mongoose = require("mongoose");

/**
 * =============================
 * Break Schema
 * =============================
 */
const breakSchema = new mongoose.Schema(
    {
        breakIn: {
            type: Date,
            required: true,
        },
        breakOut: {
            type: Date,
        },
        durationMinutes: {
            type: Number,
            default: 0,
        },
        breakType: {
            type: String,
            enum: [
                "TEA",
                "LUNCH",
                "PERSONAL",
                "OTHER",
                // 🔹 Sales / LAP Activities
                "SALES_MEETING",
                "FOLLOWUP",
                "DEMO",
                "COLLECTION"
            ],
            default: "OTHER",
        },
        // remarks: {
        //     type: String,
        // },
        remarks: {
            type: String,
            maxlength: 20,
        },
    },
    { _id: false }
);


const visitSchema = new mongoose.Schema(
    {
        visitType: {
            type: String,
            enum: [
                "CLIENT_VISIT",
                "DEMO",
                "FOLLOW_UP",
                "COLLECTION",
                "SITE_VISIT",
                "MARKET_VISIT",
                "DELIVERY",
                "OTHER"
            ],
            default: "CLIENT_VISIT"
        },



        customerName: String,

        visitIn: {
            type: Date,
            required: true,
        },

        visitOut: Date,

        durationMinutes: {
            type: Number,
            default: 0,
        },

        status: {
            type: String,
            enum: [
                "IN_PROGRESS",
                "COMPLETED",
                "CANCELLED"
            ],
            default: "IN_PROGRESS"
        },

        purpose: String,

        remarks: {
            type: String,
            maxlength: 20,
        },

        punchInLocation: {
            latitude: Number,
            longitude: Number,
            address: String,
            imageUrl: String,
        },

        punchOutLocation: {
            latitude: Number,
            longitude: Number,
            address: String,
            imageUrl: String,
        },

        distanceFromOffice: Number,

        outcome: {
            type: String,
            enum: [
                "SUCCESS",
                "NOT_AVAILABLE",
                "FOLLOWUP_REQUIRED",
                "NO_RESPONSE"
            ]
        }
    },
    { _id: false }
);

/**
 * =============================
 * Session Schema
 * =============================
 */
const sessionSchema = new mongoose.Schema(
    {
        punchIn: {
            type: Date,
            required: true,
        },
        punchOut: {
            type: Date,
        },
        durationMinutes: {
            type: Number,
            default: 0,
        },
        breaks: {
            type: [breakSchema],
            default: [],
        },
        visits: {
            type: [visitSchema],
            default: [],
        },
        punchInLocation: {
            latitude: Number,
            longitude: Number,
            address: String,
            imageUrl: String,
        },
        punchOutLocation: {
            latitude: Number,
            longitude: Number,
            address: String,
            imageUrl: String,
        },
        // Auto punch out tracking
        autoPunchedOut: {
            type: Boolean,
            default: false,
        },
        manualPunchedOut: {
            type: Boolean,
            default: false,
        },
    },
    { _id: false }
);

/**
 * =============================
 * Short Leave Sub-schema
 * =============================
 */
const shortLeaveSchema = new mongoose.Schema({
    isShortLeave: { type: Boolean, default: false },
    minutes: { type: Number, default: 0 },
    startTime: Date,
    endTime: Date,
    reason: { type: String },
}, { _id: false });

/**
 * =============================
 * Core Status Schema (stores first punch status)
 * =============================
 */
const coreStatusSchema = new mongoose.Schema({
    attendanceStatus: {
        type: String,
        enum: ["PRESENT", "SHORT_LEAVE", "HALF_DAY", "ABSENT", "HOLIDAY", "WEEK_OFF", "ON_LEAVE"],
    },
    isHalfDay: { type: Boolean, default: false },
    halfDayType: {
        type: String,
        enum: ["FIRST_HALF", "SECOND_HALF"],
    },
    morningShortLeave: {
        type: shortLeaveSchema,
        default: () => ({}),
    },
    isLate: { type: Boolean, default: false },
    lateMinutes: { type: Number, default: 0 },
}, { _id: false });

/**
 * =============================
 * Attendance Schema
 * =============================
 */
const attendanceSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
            index: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        sessions: {
            type: [sessionSchema],
            default: [],
        },
        firstPunchIn: {
            type: Date,
        },
        lastPunchOut: {
            type: Date,
        },
        totalWorkingMinutes: {
            type: Number,
            default: 0,
        },
        totalBreakMinutes: {
            type: Number,
            default: 0,
        },
        breakCount: {
            type: Number,
            default: 0,
        },

        // Late Tracking
        isLate: {
            type: Boolean,
            default: false,
        },
        lateMinutes: {
            type: Number,
            default: 0,
        },

        // Early Leave Tracking
        isEarlyLeave: {
            type: Boolean,
            default: false,
        },
        earlyLeaveMinutes: {
            type: Number,
            default: 0,
        },

        // Short Leave Tracking
        morningShortLeave: {
            type: shortLeaveSchema,
            default: () => ({}),
        },
        eveningShortLeave: {
            type: shortLeaveSchema,
            default: () => ({}),
        },

        // Half Day Tracking
        isHalfDay: {
            type: Boolean,
            default: false,
        },
        halfDayType: {
            type: String,
            enum: ["FIRST_HALF", "SECOND_HALF"],
        },

        // ====================================================================
        // CORE STATUS FIELDS - Stores first punch status (persists across saves)
        // These are CRITICAL for the evaluator to work correctly
        // ====================================================================
        coreAttendanceStatus: {
            type: String,
            enum: ["PRESENT", "SHORT_LEAVE", "HALF_DAY", "ABSENT", "HOLIDAY", "WEEK_OFF", "ON_LEAVE"],
        },
        coreIsHalfDay: {
            type: Boolean,
            default: false,
        },
        coreHalfDayType: {
            type: String,
            enum: ["FIRST_HALF", "SECOND_HALF"],
        },
        coreMorningShortLeave: {
            type: shortLeaveSchema,
            default: () => ({}),
        },
        coreIsLate: {
            type: Boolean,
            default: false,
        },
        coreLateMinutes: {
            type: Number,
            default: 0,
        },

        // ====================================================================
        // STATUS FIELDS
        // ====================================================================
        // Real-time punch state (PRESENT when punched in, ABSENT when punched out)
        status: {
            type: String,
            enum: ["PRESENT", "ABSENT"],
            default: "ABSENT",
        },

        // Final HR verdict
        attendanceStatus: {
            type: String,
            enum: [
                "PRESENT",
                "HALF_DAY",
                "SHORT_LEAVE",
                "ABSENT",
                "WEEK_OFF",
                "HOLIDAY",
                "ON_LEAVE",
            ],
            default: "ABSENT",
        },

        leaveReference: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Leave",
        },
        evaluationSource: {
            type: String,
            enum: ["SYSTEM", "MANUAL_OVERRIDE"],
            default: "SYSTEM",
        },
        remarks: {
            type: String,
            maxlength: 20,
        },

        regularized: {
            type: Boolean,
            default: false,
        },

        regularizationRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AttendanceRegularization",
            default: null,
        },

        regularizedAt: {
            type: Date,
            default: null,
        },

        regularizedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            default: null,
        },
    },
    { timestamps: true }
);

// ====================================================================
// OPTIMIZED INDEXES - CRITICAL FOR PERFORMANCE
// ====================================================================

// 1. Unique index for employee + date (prevents duplicates)
attendanceSchema.index(
    { employee: 1, date: 1 },
    { unique: true }
);

// 2. Compound index for date range queries with employee filter (MOST USED)
attendanceSchema.index(
    { date: 1, employee: 1 }
);

// 3. Compound index for employee-based queries with sorting by date
attendanceSchema.index(
    { employee: 1, date: -1 }
);

// 4. Index for filtering by attendance status with date range
attendanceSchema.index(
    { employee: 1, attendanceStatus: 1, date: -1 }
);

// 5. Index for core status queries (used in reports)
attendanceSchema.index(
    { employee: 1, date: -1, coreAttendanceStatus: 1 }
);

// 6. Index for date-only queries (holidays, weekends, etc.)
attendanceSchema.index(
    { date: -1 }
);

// 7. Index for regularization queries
attendanceSchema.index(
    { regularized: 1, date: -1 }
);

// 8. Compound index for employee + status queries
attendanceSchema.index(
    { employee: 1, status: 1, date: -1 }
);

// 9. Index for covering queries with projection (reduces document scanning)
attendanceSchema.index(
    { employee: 1, date: 1, attendanceStatus: 1, coreAttendanceStatus: 1 }
);

// 10. Index for monthly aggregation queries
attendanceSchema.index(
    { date: -1, employee: 1, attendanceStatus: 1 }
);

// ====================================================================
// SCHEMA OPTIONS FOR PERFORMANCE
// ====================================================================

// Set to use lean by default for queries (reduces overhead)
attendanceSchema.set('toObject', {
    virtuals: true,
    getters: true
});

attendanceSchema.set('toJSON', {
    virtuals: true,
    getters: true
});

// Add query helper for common date range queries
attendanceSchema.query.byDateRange = function (fromDate, toDate) {
    return this.find({
        date: { $gte: fromDate, $lte: toDate }
    });
};

// Add query helper for employee attendance in month
attendanceSchema.query.forEmployeeInMonth = function (employeeId, fromDate, toDate) {
    return this.find({
        employee: employeeId,
        date: { $gte: fromDate, $lte: toDate }
    });
};

// Static method for optimized monthly report
attendanceSchema.statics.getMonthlyReport = async function ({
    employeeIds,
    fromDate,
    toDate,
    projection = null
}) {
    const defaultProjection = {
        employee: 1,
        date: 1,
        coreAttendanceStatus: 1,
        attendanceStatus: 1,
        status: 1,
        firstPunchIn: 1,
        lastPunchOut: 1,
        totalWorkingMinutes: 1,
        totalBreakMinutes: 1,
        breakCount: 1,
        isLate: 1,
        coreIsLate: 1,
        lateMinutes: 1,
        coreLateMinutes: 1,
        isHalfDay: 1,
        coreIsHalfDay: 1,
        halfDayType: 1,
        coreHalfDayType: 1,
        remarks: 1
    };

    return this.find({
        employee: { $in: employeeIds },
        date: { $gte: fromDate, $lte: toDate }
    })
        .select(projection || defaultProjection)
        .lean()
        .hint({ employee: 1, date: 1 })
        .maxTimeMS(30000); // 30 second timeout
};

module.exports = mongoose.model("Attendance", attendanceSchema);