const { ObjectId } = require('mongodb');
const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { employeeService } = require("../services");

const getEmployeeProfile = catchAsync(async (req, res) => {

    let filterQuery = {};

    filterQuery["_id"] = new ObjectId(req.user.employeeId)

    const employeeProfile = await employeeService.getEmployeeProfile(filterQuery);

    res.status(httpStatus.status.OK).json({
        message: "Profile fetched successful",
        status: httpStatus.status.OK,
        data: employeeProfile,
    });
})
const getEmployees = catchAsync(async (req, res) => {

    let filterQuery = {
        _id: {
            $ne: new ObjectId(req.user.employeeId)
        }
    };

    const employees = await employeeService.getEmployees(filterQuery);

    res.status(httpStatus.status.OK).json({
        message: "Employees fetched successful",
        status: httpStatus.status.OK,
        data: employees,
    });
})

module.exports = {
    getEmployeeProfile,
    getEmployees
}