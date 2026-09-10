const express = require('express');
const router = express.Router();
const { dashboardController } = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');


router.get('/',
    auth(),
    dashboardController.getDashboardData);



router.get('/department-distribution',
    auth(),
    dashboardController.getDepartmentDistribution);


router.get('/attendance-trend',
    auth(),
    dashboardController.getAttendanceTrend);


module.exports = router;