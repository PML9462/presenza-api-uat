const httpStatus = require('http-status');
const { ObjectId } = require('mongodb');
const { leaveService,employeeService } = require('../../services/index');
const catchAsync = require('../../utils/catchAsync');

const getLeaves = async (req, res) => {


    const matchQuery = {};

    const employeeMatchQuery = {};
    if (req.user.role == 'MANAGER') {
        employeeMatchQuery["reportingTo"] = new ObjectId(req.user.employeeId)
    }


    const employees = await employeeService.getEmployees(employeeMatchQuery);

    const employeeIds = employees.map(emp => emp._id.toString());

    if (employeeIds.length > 0) {
        matchQuery.employee = { $in: employeeIds.map(id => new ObjectId(id)) }
    }


    const leaves = await leaveService.getLeaves(matchQuery);

    return res.status(httpStatus.status.OK).json({
        success: true,
        message: "Leaves fetched successfully",
        data: leaves,
    });
}
const approveLeave = async (req, res) => {

    const leaves = await leaveService.approveLeave(req.params.id);

    return res.status(httpStatus.status.OK).json({
        success: true,
        message: "Leaves approved successfully",
        data: leaves,
    });
}
const rejectLeave = async (req, res) => {
    const leaves = await leaveService.rejectLeave(req.params.id,req.body.rejectionReason);

    return res.status(httpStatus.status.OK).json({
        success: true,
        message: "Leave rejected",
        data: leaves,
    });
}
module.exports = { getLeaves, approveLeave, rejectLeave }