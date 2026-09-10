const express = require('express');
const router = express.Router();
const activitiesController = require('../controllers/activities.controller');


// // All routes require authentication
// router.use(auth());

// Get today's status
router.post('/', activitiesController.exportActivityData);

router.post('/export', activitiesController.exportActivityData);



module.exports = router;