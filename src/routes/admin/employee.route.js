const express = require('express');
const router = express.Router();
const {employeeController} = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');

router.get('/', auth(), employeeController.getEmployees);
router.post('/', employeeController.createEmployee);
router.patch('/:id', auth(), employeeController.updateEmployee);

router.patch('/:id/status', auth(), employeeController.updateEmployeeStatus);


module.exports = router;