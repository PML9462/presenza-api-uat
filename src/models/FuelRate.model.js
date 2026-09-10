const mongoose = require('mongoose');

const fuelRateSchema = new mongoose.Schema({
    stateName: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    stateCode: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 3
    },
    revisedRateFourWheeler: {
        type: Number,
        required: true,
        min: 0
    },
    revisedTwoWheeler: {
        type: Number,
        required: true,
        min: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
fuelRateSchema.index({ stateName: 1 });

module.exports = mongoose.model('FuelRate', fuelRateSchema);