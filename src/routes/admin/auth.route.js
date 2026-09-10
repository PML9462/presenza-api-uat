const express = require('express');
const router = express.Router();
const {authController} = require('../../controllers/admin/index');
// const auth = require('../middlewares/auth');

router.post('/login', authController.login);
// router.post('/verify-otp', authController.verifyOtp);
// router.post('/refresh-token', authController.refreshTokens);
// router.post('/logout', auth(), authController.logout);


module.exports = router;