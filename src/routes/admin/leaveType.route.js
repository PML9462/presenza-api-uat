const express = require('express');
const router = express.Router();
const {leaveTypeController} = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');


router.get('/',auth(), leaveTypeController.getLeaveTypes);
router.post('/', leaveTypeController.createLeaveType);


module.exports = router;