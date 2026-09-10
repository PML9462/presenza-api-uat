const express = require('express');
const router = express.Router();
const { reportController } = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');

router.get(
    "/monthly",
    auth(),
    reportController.getMonthlyAttendance
);

// Add new endpoint for paginated monthly attendance
router.get(
    "/monthly/paginated",
    auth(),
    reportController.getMonthlyAttendancePaginated
);

// Add endpoint for attendance summary (lighter response)
router.get(
    "/monthly/summary",
    auth(),
    reportController.getMonthlyAttendanceSummary
);

module.exports = router;