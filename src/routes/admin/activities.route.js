const express = require('express');
const router = express.Router();
const { activitiesController } = require('../../controllers/admin/index');

// Existing routes
router.get('/top', activitiesController.getTopActivities);
router.get('/', activitiesController.getActivityData);
router.get('/stats', activitiesController.getEmployeeStats);

// New enhanced routes
router.get('/apps', activitiesController.getAppsList);
router.get('/app-history', activitiesController.getAppHistory);
router.get('/search-history', activitiesController.getActivitySearch);
router.get('/date-range', activitiesController.getActivitiesByDateRange);

module.exports = router;