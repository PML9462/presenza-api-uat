const {fuelRateService} = require('../services/index');

class FuelRateController {

    // Get all fuel rates
    async getAllFuelRates(req, res) {
        try {
            const result = await fuelRateService.getAllFuelRates();
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

}

module.exports = new FuelRateController();