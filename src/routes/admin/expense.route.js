const express = require('express');
const router = express.Router();
const {expenseController} = require('../../controllers/admin/index');
// const { upload, uploadToS3 } = require('../middlewares/uploadToS3');
const auth = require('../../middlewares/admin/auth');

// All routes require authentication
router.use(auth());


router.get('/', expenseController.getExpenses);

router.post('/approve/:id',  expenseController.approveExpense);

router.post('/reject/:id',  expenseController.rejectExpense);
// router.post('/',upload,uploadToS3, expenseController.createExpense);

module.exports = router;