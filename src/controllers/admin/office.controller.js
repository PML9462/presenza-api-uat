const httpStatus = require('http-status');
const { officeService } = require('../../services/index');
const catchAsync = require('../../utils/catchAsync');

const addOffice = catchAsync(async (req, res) => {
    const data = await officeService.addOffice(req.body)
    return res.status(httpStatus.status.CREATED).json({
        success: true,
        message: "Office added successfully",
        data: data,
    });
})
const getOffices = catchAsync(async (req, res) => {
    const data = await officeService.getOffices()
    return res.status(httpStatus.status.OK).json({
        success: true,
        message: "Office fetched successfully",
        data: data,
    });
})

module.exports = {
    addOffice,
    getOffices
}