const httpStatus = require('http-status')
const ApiError = require('../utils/ApiError')
const WeeklyOffPolicy = require("../models/weeklyOffPolicy.model");

const createWeeklyOffPolicy = async (data) => {

  const { name, customRules, type } = data;

  if (!name)
    throw new Error("Policy name is required");

  if (!customRules || !Array.isArray(customRules) || customRules.length === 0)
    throw new Error("Rules are required");

  const existing = await WeeklyOffPolicy.findOne({ name });

  if (existing)
    throw new Error("Weekly off policy already exists");

  // customRules.forEach((rule) => {

  //   if (rule.day === undefined)
  //     throw new Error("dayOfWeek is required");

  //   if (!["ALL", "SELECTED"].includes(rule.type))
  //     throw new Error("Invalid rule type");

  //   if (rule.type === "SELECTED") {
  //     if (!rule.weeks || rule.weeks.length === 0)
  //       throw new Error("Weeks required for SELECTED rule");

  //     rule.weeks.forEach((week) => {
  //       if (week < 1 || week > 5)
  //         throw new Error("Week must be between 1 and 5");
  //     });
  //   }
  // });

  const policy = await WeeklyOffPolicy.create({
    name,
    customRules,
  });

  return policy;
};
const getWeeklyOffPolicy = async (filterQuery) => {
  try {
    return await WeeklyOffPolicy.find();
  } catch (error) {
    throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
  }
}
module.exports = {
  createWeeklyOffPolicy,
  getWeeklyOffPolicy
};
