const { ObjectId } = require('mongodb');
const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { attendanceService, employeeService } = require('../../services/index')

const getDashboardData = catchAsync(async (req, res) => {
    const { employeeId, date, startDate, endDate } = req.query;

    const attendanceSummary = await attendanceService.getAttendanceSummary({
        employeeId,
        date,
        startDate,
        endDate,
    },req.user);

    return res.status(200).json({
        success: true,
        message: "Summary fetched successfully",
        data: attendanceSummary,
    });
});

const getDepartmentDistribution = catchAsync(async (req, res) => {
    const { employeeId } = req.query;

    const data = await attendanceService.getDepartmentDistribution({
        employeeId,
    },req.user);

    return res.status(200).json({
        success: true,
        message: "Department distribution fetched successfully",
        data,
    });
});

const getAttendanceTrend = catchAsync(async (req, res) => {
  const { employeeId, date, startDate, endDate } = req.query;

  const data = await attendanceService.getAttendanceTrend({
    employeeId,
    date,
    startDate,
    endDate,
  },req.user);

  return res.status(200).json({
    success: true,
    message: "Attendance trend fetched successfully",
    data,
  });
});
module.exports = { getDashboardData, getDepartmentDistribution,getAttendanceTrend }