const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync')
const weeklyOffService = require("../services/weeklyOff.service");

const createWeeklyOffPolicy = catchAsync(async (req, res) => {
  const result = await weeklyOffService.createWeeklyOffPolicy(req.body);

  return res.status(httpStatus.status.CREATED).json({
    message: "Weekly off policy created successfully",
    data: result,
  });


});
const getWeeklyOffPolicy = catchAsync(async (req, res) => {
  const result = await weeklyOffService.getWeeklyOffPolicy();

  return res.status(httpStatus.status.OK).json({
    message: "Weekly off policy fetched successfully",
    data: result,
  });
})
module.exports = {
  createWeeklyOffPolicy,
  getWeeklyOffPolicy
};
