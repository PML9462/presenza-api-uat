const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expense.controller');
const { upload, uploadToS3 } = require('../middlewares/uploadToS3');
const auth = require('../middlewares/auth');

// All routes require authentication
router.use(auth());


router.get('/', expenseController.getExpenses);

router.post('/',upload,uploadToS3, expenseController.createExpense);

module.exports = router;