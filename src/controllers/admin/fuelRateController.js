const {fuelRateService} = require('../../services/index');

class FuelRateController {
    // Create/Insert multiple fuel rates
    async createFuelRates(req, res) {
        try {
            const fuelRatesData = req.body;
            
            // Validate input
            if (!Array.isArray(fuelRatesData) || fuelRatesData.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide an array of fuel rate data'
                });
            }

            // Validate each item
            for (const data of fuelRatesData) {
                if (!data.stateName || !data.revisedRateFourWheeler || 
                    !data.revisedTwoWheeler) {
                    return res.status(400).json({
                        success: false,
                        message: 'Missing required fields. Required: stateName, revisedRateFourWheeler, revisedTwoWheeler, revisedEmployeeCar'
                    });
                }
            }

            const result = await fuelRateService.createFuelRates(fuelRatesData);
            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Create single fuel rate
    async createFuelRate(req, res) {
        try {
            const fuelRateData = req.body;
            
            // Validate input
            if (!fuelRateData.stateName || !fuelRateData.revisedRateFourWheeler || 
                !fuelRateData.revisedTwoWheeler || !fuelRateData.revisedEmployeeCar) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields. Required: stateName, revisedRateFourWheeler, revisedTwoWheeler, revisedEmployeeCar'
                });
            }

            const result = await fuelRateService.createFuelRate(fuelRateData);
            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

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

    // Get fuel rate by state name
    async getFuelRateByState(req, res) {
        try {
            const { stateName } = req.params;
            
            if (!stateName) {
                return res.status(400).json({
                    success: false,
                    message: 'State name is required'
                });
            }

            const result = await fuelRateService.getFuelRateByState(stateName);
            
            if (!result.success) {
                return res.status(404).json(result);
            }
            
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Update fuel rate
    async updateFuelRate(req, res) {
        try {
            const { stateName } = req.params;
            const updateData = req.body;
            
            if (!stateName) {
                return res.status(400).json({
                    success: false,
                    message: 'State name is required'
                });
            }

            const result = await fuelRateService.updateFuelRate(stateName, updateData);
            
            if (!result.success) {
                return res.status(404).json(result);
            }
            
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }

    // Delete fuel rate
    async deleteFuelRate(req, res) {
        try {
            const { stateName } = req.params;
            
            if (!stateName) {
                return res.status(400).json({
                    success: false,
                    message: 'State name is required'
                });
            }

            const result = await fuelRateService.deleteFuelRate(stateName);
            
            if (!result.success) {
                return res.status(404).json(result);
            }
            
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