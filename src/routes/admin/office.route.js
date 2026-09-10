const express = require('express');
const router = express.Router();
const {officeController} = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');


router.post('/',auth(), officeController.addOffice);
router.get('/', auth(), officeController.getOffices);



module.exports = router;