const express = require('express');
const router = express.Router();
const { departmentController } = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');

router.post('/',
    auth(),
    departmentController.createDepartment);
router.get('/',
    auth(),
    departmentController.getDepartments);



module.exports = router;