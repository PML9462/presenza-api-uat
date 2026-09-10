const mongoose = require("mongoose");

const attendeeSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "ACCEPTED", "DECLINED"],
            default: "PENDING",
        },
        responseTime: {
            type: Date,
        },
    },
    { _id: false }
);

const reminderSchema = new mongoose.Schema(
    {
        minutesBefore: {
            type: Number, // e.g. 15, 30, 60
            // required: true,
        },
        sent: {
            type: Boolean,
            default: false,
        },
    },
    { _id: false }
);

const meetingSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            trim: true,
        },

        type: {
            type: String,
            enum: ["VIRTUAL", "IN_PERSON"],
            default: "IN_PERSON",
        },

        date: {
            type: Date,
            required: true,
        },

        startTime: {
            type: Date,
            required: true,
        },

        endTime: {
            type: Date,
            required: true,
        },

        duration: {
            type: Number, // in minutes
        },

        location: {
            type: String, // room name OR meeting link label
            trim: true,
        },

        meetingLink: {
            type: String, // for virtual meetings
            trim: true,
        },

        organizer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
            required: true,
        },

        attendees: [attendeeSchema],

        reminders: [reminderSchema],

        recurring: {
            isRecurring: {
                type: Boolean,
                default: false,
            },
            frequency: {
                type: String,
                enum: ["DAILY", "WEEKLY", "MONTHLY"],
            },
            endDate: Date,
        },

        isCancelled: {
            type: Boolean,
            default: false,
        },

        cancelledAt: Date,

        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employee",
        },

        status: {
            type: String,
            enum: ["SCHEDULED", "ONGOING", "COMPLETED", "CANCELLED"],
            default: "SCHEDULED",
        },
    },
    {
        timestamps: true,
    }
);


// // ✅ Indexes for performance
// meetingSchema.index({ date: 1 });
// meetingSchema.index({ organizer: 1 });
// meetingSchema.index({ "attendees.user": 1 });


// // ✅ Pre-save hook to calculate duration automatically
// meetingSchema.pre("save", function (next) {
//     if (this.startTime && this.endTime) {
//         this.duration = Math.floor(
//             (this.endTime - this.startTime) / (1000 * 60)
//         );
//     }
//     next();
// });


module.exports = mongoose.model("Meeting", meetingSchema);