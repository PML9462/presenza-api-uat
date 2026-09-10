const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService } = require('../services');
const AUTH_STEPS = require('../constants/authSteps');

/* -------------------- SEND OTP -------------------- */
const sendOtp = catchAsync(async (req, res) => {
  const { employeeCode } = req.body;

  const result = await authService.sendOtp({ employeeCode });

  return res.status(httpStatus.status.OK).json({
    message: 'OTP sent successfully',
    step: AUTH_STEPS.VERIFY_OTP,
    data: result,
  });
});

/* -------------------- VERIFY OTP -------------------- */
const verifyOtp = catchAsync(async (req, res) => {

  console.log(req.headers);

  console.log("Device ID:", req.headers["x-device-id"]);
  console.log("Platform:", req.headers["x-platform"]);
  console.log("App Version:", req.headers["x-app-version"]);
  console.log("OS Version:", req.headers["x-os-version"]);
  console.log("FCM Token:", req.headers["x-fcmtoken"]);


  const { employeeCode, otp } = req.body;



  const deviceInfo = {
    deviceId: req.headers['x-device-id'],
    platform: req.headers['x-platform'],
    appVersion: req.headers['x-app-version'],
    osVersion: req.headers['x-os-version'],
    fcmToken: req.headers['x-fcmtoken'],
  };


  const result = await authService.verifyOtp({ employeeCode, otp, deviceInfo });

  return res.status(httpStatus.status.OK).json({
    message: 'Login successful',
    step: result.step,
    data: {
      tokens: result.tokens,
      user: result.user,
    },
  });
});

/* -------------------- REFRESH TOKEN -------------------- */
const refreshTokens = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;

  const tokens = await authService.refreshTokens(refreshToken);

  return res.status(httpStatus.status.OK).json({
    message: 'Tokens refreshed successfully',
    data: { tokens },
  });
});

/* -------------------- LOGOUT -------------------- */
const logout = catchAsync(async (req, res) => {
  const { employeeId } = req.user; // Assuming middleware sets req.user
  const deviceId = req.headers['x-device-id'];

  await authService.logout(employeeId, deviceId);

  return res.status(httpStatus.status.OK).json({
    message: 'Logged out successfully',
  });
});
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;


  const result = await authService.login({ email, password });

  return res.status(httpStatus.status.OK).json({
    message: 'Login successful',
    data: {
      tokens: result.tokens,
      user: result.user,
    },
  });
});

const changeMpin = catchAsync(async (req, res) => {
  const { employeeId } = req.user; // Assuming middleware sets req.user
  const { oldMpin, newMpin } = req.body;

  await authService.changeMpin(employeeId, oldMpin, newMpin);

  return res.status(httpStatus.status.OK).json({
    message: 'MPIN changed successfully',
  });
});
module.exports = {
  sendOtp,
  verifyOtp,
  refreshTokens,
  logout,
  login,
  changeMpin
};