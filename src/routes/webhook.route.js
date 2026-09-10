const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/webhook.controller");
const auth = require('../middlewares/auth');

// router.use(auth());

router.post("/",express.text(), webhookController.recieveData);

module.exports = router;
