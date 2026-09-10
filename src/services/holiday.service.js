const Holiday = require("../models/holiday.model");
const Calendar = require("../models/holidayCalendar.model");
const moment = require("moment");

const addHoliday = async (data) => {

  const { name, date, isOptional, calendarId } = data;

  if (!name || !date || !calendarId)
    throw new Error("Name, date and calendarId are required");

  const calendar = await Calendar.findById(calendarId);

  if (!calendar)
    throw new Error("Calendar not found");

  const holidayYear = moment(date).year();

  if (holidayYear !== calendar.year)
    throw new Error("Holiday date does not match calendar year");

  const existing = await Holiday.findOne({
    date,
    calendar: calendarId,
  });

  if (existing)
    throw new Error("Holiday already exists for this date");

  const holiday = await Holiday.create({
    name,
    date,
    isOptional: isOptional || false,
    calendar: calendarId,
  });

  return holiday;
};

module.exports = {
  addHoliday,
};
