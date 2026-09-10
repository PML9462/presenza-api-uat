const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

const fuelRateController = require('../controllers/fuelRateController');
router.use(auth());


router.get('/', fuelRateController.getAllFuelRates);


module.exports = router;