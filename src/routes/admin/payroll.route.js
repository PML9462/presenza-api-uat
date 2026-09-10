const express = require('express');
const router = express.Router();
const { payrollController } = require('../../controllers/admin/index');
const verifyPayrollWebhook = require(
    "../../middlewares/admin/payrollWebhook.middleware"
);

const { upload, uploadToS3 } = require("../../middlewares/uploadToS3");


router.post('/salary-slip', upload, uploadToS3, verifyPayrollWebhook, payrollController.addPayroll);



module.exports = router;