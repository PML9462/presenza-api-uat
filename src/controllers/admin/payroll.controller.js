// controllers/admin/payroll.controller.js

const catchAsync = require("../../utils/catchAsync");
const payrollWebhookService = require("../../services/payroll.service");

const addPayroll = catchAsync(async (req, res) => {

    const result =
        await payrollWebhookService.uploadSalarySlip(req);

    return res.status(200).json({
        success: true,
        message: "Salary slip uploaded successfully",
        data: result,
    });

});

module.exports = {
    addPayroll,
};