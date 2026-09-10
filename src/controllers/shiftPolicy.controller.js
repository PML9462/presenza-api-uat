const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync"); // if you are using this pattern
const { shiftPolicyService } = require("../services/index");

/* -------------------- Create Shift Policy -------------------- */
const createShiftPolicy = catchAsync(async (req, res) => {
    const shiftPolicy = await shiftPolicyService.createShiftPolicy(req.body);

    res.status(httpStatus.status.CREATED).json({
        message: "Shift policy created successfully",
        data: shiftPolicy,
    });
});
const getShiftPolicy = catchAsync(async (req, res) => {
    const shiftPolicy = await shiftPolicyService.getShiftPolicy();

    res.status(httpStatus.status.CREATED).json({
        message: "Shift policy fetched successfully",
        data: shiftPolicy,
    });
})
module.exports = {
    createShiftPolicy,
    getShiftPolicy
};
