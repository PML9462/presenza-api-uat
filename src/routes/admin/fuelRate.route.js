const express = require('express');
const router = express.Router();
const { fuelRateController } = require('../../controllers/admin/index');


const auth = require('../../middlewares/admin/auth');

// All routes require authentication
// router.use(auth());
// POST routes
router.post('/bulk', fuelRateController.createFuelRates);
router.post('/', fuelRateController.createFuelRate);

// GET routes
router.get('/', fuelRateController.getAllFuelRates);
router.get('/:stateName', fuelRateController.getFuelRateByState);

// PUT route
router.put('/:stateName', fuelRateController.updateFuelRate);

// DELETE route
router.delete('/:stateName', fuelRateController.deleteFuelRate);

module.exports = router;