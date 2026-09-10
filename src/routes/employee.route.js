const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee.controller');
const auth = require('../middlewares/auth');

// All routes require authentication
router.use(auth());


router.get('/profile', employeeController.getEmployeeProfile);

router.get('/', employeeController.getEmployees);

module.exports = router;