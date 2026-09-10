const holidayService = require("../services/holiday.service");

const addHoliday = async (req, res) => {
  try {
    const result = await holidayService.addHoliday(req.body);

    res.status(201).json({
      message: "Holiday added successfully",
      data: result,
    });

  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

module.exports = {
  addHoliday,
};
