const express = require("express");
const router = express.Router();
const leaveController = require("../controllers/leave.controller");
const auth = require('../middlewares/auth');

router.use(auth());

router.post("/", leaveController.createLeave);
router.get("/", leaveController.getLeaves);

module.exports = router;
