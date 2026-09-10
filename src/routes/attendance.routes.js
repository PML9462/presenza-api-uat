const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const auth = require('../middlewares/auth');
const { upload, uploadToS3 } = require("../middlewares/uploadToS3");

// All routes require authentication
router.use(auth());

// Punch in/out with image upload
router.post('/punch-in', upload, uploadToS3, attendanceController.punchIn);
router.post('/punch-out', upload, uploadToS3, attendanceController.punchOut);

// Break management
router.post('/break-in', attendanceController.breakIn);
router.post('/break-out', attendanceController.breakOut);


// Visit management
router.post('/visit-in',upload, uploadToS3, attendanceController.visitIn);
router.post('/visit-out', upload, uploadToS3, attendanceController.visitOut);



// History and reports
router.get('/history', attendanceController.getAttendanceHistory);
router.get('/summary', attendanceController.getAttendanceSummary);


router.post('/regularize-attendance', attendanceController.regularizeAttendance);
router.get('/regularize-attendance', attendanceController.getRegularizeAttendanceRequests);

module.exports = router;