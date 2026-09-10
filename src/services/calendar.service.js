const Calendar = require("../models/holidayCalendar.model");

const createCalendar = async (data) => {
  const { year, name,office } = data;

  if (!year) throw new Error("Year is required");

  const existing = await Calendar.findOne({ year });
  if (existing)
    throw new Error(`Calendar for year ${year} already exists`);

  const calendar = await Calendar.create({
    year,
    name: name || `Calendar ${year}`,
    office
  });

  return calendar;
};

module.exports = {
  createCalendar,
};
