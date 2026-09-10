const express = require("express");
const router = express.Router();
const calendarController = require("../controllers/calendar.controller");

router.post("/", calendarController.createCalendar);

module.exports = router;
