const mongoose = require('mongoose');

const ActivityEventSchema = new mongoose.Schema(
    {
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee',
            required: true,
            index: true,
        },

        eventId: {
            type: Number, 
            required: true,
        },

        timestamp: {
            type: Date,
            required: true,
            index: true,
        },

        duration: Number,

        app: String,
        title: String,

        date: {
            type: String, 
            index: true,
        },
    },
    { timestamps: true }
);

ActivityEventSchema.index(
    { employeeId: 1, eventId: 1 },
    { unique: true }
);

module.exports = mongoose.model('ActivityEvent', ActivityEventSchema);
