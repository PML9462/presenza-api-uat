const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const { webhookService } = require("../services/index");
const recieveData = catchAsync(async (req, res) => {
    const payload = req.body.toString(); // 👈 IMPORTANT


    const result = await webhookService.recieveData(payload);

    return res.status(200).json({
        success: true,
        message: "Webhook data received successfully",
        data: result
    });
});

module.exports = {
    recieveData
}