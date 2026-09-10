const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middlewares/auth');

router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/refresh-token', authController.refreshTokens);
router.post('/logout', auth(), authController.logout);
router.post('/login', authController.login);

router.post('/change-mpin', auth(), authController.changeMpin);

module.exports = router;