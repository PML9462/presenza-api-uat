const express = require("express");
const router = express.Router();
const holidayController = require("../controllers/holiday.controller");

router.post("/", holidayController.addHoliday);

module.exports = router;
