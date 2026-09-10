const express = require('express');
const router = express.Router();
const { designationController } = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');

router.post('/',
    auth(),
    designationController.createDesignation);
router.get('/',
    auth(),
    designationController.getDesignations);



module.exports = router;