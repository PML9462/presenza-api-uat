const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError')
const { ShiftPolicy } = require("../models/index");

/* -------------------- Create Shift Policy -------------------- */
const createShiftPolicy = async (data) => {
    const {
        name,
        startTime,
        endTime,
        firstHalfEndTime,
        minimumFullDayMinutes,
        minimumHalfDayMinutes,
        graceLateMinutes,
        maxShortLeaveMinutes,
        autoPunchOut,
        isActive,
        weeklyOffPolicy
    } = data;

    // Check if policy with same name already exists
    const existingPolicy = await ShiftPolicy.findOne({ name });

    if (existingPolicy) {
        throw new Error("Shift policy with this name already exists");
    }

    const shiftPolicy = await ShiftPolicy.create({
        name,
        startTime,
        endTime,
        firstHalfEndTime,
        minimumFullDayMinutes,
        minimumHalfDayMinutes,
        graceLateMinutes,
        maxShortLeaveMinutes,
        autoPunchOut,
        isActive,
        weeklyOffPolicy
    });

    return shiftPolicy;
};
const getShiftPolicy = async (filterQuery) => {
    try {
        return await ShiftPolicy.find(filterQuery)
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
    }
}
module.exports = {
    createShiftPolicy,
    getShiftPolicy
};
