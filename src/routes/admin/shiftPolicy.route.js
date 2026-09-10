const express = require("express");
const router = express.Router();
const shiftPolicyController = require("../../controllers/shiftPolicy.controller");
const auth = require('../../middlewares/admin/auth');

router.post("/",auth(), shiftPolicyController.createShiftPolicy);
router.get("/", auth(), shiftPolicyController.getShiftPolicy);

module.exports = router;
