
const httpStatus = require('http-status');
const { leaveTypeService } = require('../../services/index');
const catchAsync = require('../../utils/catchAsync');

const createLeaveType = catchAsync(async (req, res) => {
    const data = await leaveTypeService.createLeaveType(req.body)
    return res.status(httpStatus.status.CREATED).json({
        success: true,
        message: "Leave type created successfully",
        data: data,
    });
})

const getLeaveTypes = catchAsync(async(req,res)=>{
    const data = await leaveTypeService.getLeaveTypes()
    return res.status(httpStatus.status.CREATED).json({
        success: true,
        message: "Leave type created successfully",
        data: data,
    });
})
module.exports = {
    createLeaveType,
    getLeaveTypes
}