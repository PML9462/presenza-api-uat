const express = require("express");
const router = express.Router();
const meetingController = require("../controllers/meeting.controller");
const auth = require('../middlewares/auth');

router.use(auth());

router.post("/", meetingController.createMeeting);
router.get("/", meetingController.getMeetings);
module.exports = router;
