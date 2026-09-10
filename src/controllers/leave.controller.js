const { ObjectId } = require('mongodb');
const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { leaveService } = require("../services");


const createLeave = catchAsync(async (req, res) => {

    const employeeId = req.user.employeeId;

    const leave = await leaveService.createLeaveRequest({
        employeeId,
        ...req.body,
    });

    res.status(201).json({
        success: true,
        message: "Leave request submitted successfully",
        data: leave,
    });


    // const leave = await leaveService.createLeave(req.body);
    // return res.status(httpStatus.status.CREATED).json({
    //     message: "Leave request created successfully",
    //     status: httpStatus.status.OK,
    //     data: leave
    // })
})
const getLeaves = catchAsync(async (req, res) => {
    const employeeId = req.user.employeeId;

    let filterQuery = {};

    filterQuery["employee"] = new ObjectId(employeeId)

    const leave = await leaveService.getLeaves(filterQuery);

    res.status(201).json({
        success: true,
        message: "Leave fetched successfully",
        data: leave,
    });
})

module.exports = {
    createLeave,
    getLeaves
}