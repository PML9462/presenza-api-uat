const express = require('express');
const router = express.Router();
const { attendanceController } = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');

router.get('/',
    auth(),
    attendanceController.getAttendance);


router.get('/report',
    auth(),
    attendanceController.getAttendanceReport);


// Admin/HR routes

router.get(
    '/regularization',
    auth(),
    attendanceController.getRegularizationRequests
);

router.put(
    '/regularization/:regularizationId/approve',
    auth(),
    attendanceController.approveRegularization
);

router.put(
    '/regularization/:regularizationId/reject',
    auth(),
    attendanceController.rejectRegularization
);

// Summary routes
router.get(
    '/regularization-summary/:employeeId',
    auth(),
    attendanceController.getEmployeeRegularizationSummary
);




module.exports = router;