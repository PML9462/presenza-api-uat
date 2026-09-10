const calendarService = require("../services/calendar.service");

const createCalendar = async (req, res) => {
  try {
    const result = await calendarService.createCalendar(req.body);

    res.status(201).json({
      message: "Calendar created successfully",
      data: result,
    });

  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

module.exports = {
  createCalendar,
};
