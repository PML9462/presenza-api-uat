const express = require('express');
const router = express.Router();
const { leaveController } = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');


router.get('/', auth(), leaveController.getLeaves);

router.post('/:id/approve', leaveController.approveLeave)

router.post('/:id/reject', auth(), leaveController.rejectLeave)

module.exports = router;