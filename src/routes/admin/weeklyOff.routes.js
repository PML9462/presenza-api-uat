const express = require("express");
const router = express.Router();
const weeklyOffController = require("../../controllers/weeklyOff.controller");
const auth = require('../../middlewares/admin/auth');

router.post("/", auth(), weeklyOffController.createWeeklyOffPolicy);
router.get("/", auth(), weeklyOffController.getWeeklyOffPolicy);


module.exports = router;
