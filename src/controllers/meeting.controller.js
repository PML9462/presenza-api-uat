
const { ObjectId } = require('mongodb');
const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");

const { meetingService } = require("../services/index");

const createMeeting = catchAsync(async (req, res) => {

    const employeeId = req.user.employeeId;

    const meeting = await meetingService.createMeeting({
        ...req.body,
        organizer: employeeId,
    });

    return res.status(201).json({
        success: true,
        message: "Meeting scheduled successfully",
        data: meeting,
    });

});
const getMeetings = catchAsync(async (req, res) => {

    const employeeId = req.user.employeeId;

    const meetings = await meetingService.getMeetings({
        userId: employeeId,
    });

    return res.status(201).json({
        success: true,
        message: "Meetings fetched successfully",
        data: meetings,
    });

})
module.exports = {
    createMeeting,
    getMeetings,
};