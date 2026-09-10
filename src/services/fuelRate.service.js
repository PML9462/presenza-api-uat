const { FuelRate } = require('../models/index');

class FuelRateService {
    // Create/Insert multiple fuel rates
    async createFuelRates(fuelRatesData) {
        try {
            const operations = fuelRatesData.map(data => ({
                updateOne: {
                    filter: { stateName: data.stateName },
                    update: { $set: data },
                    upsert: true
                }
            }));

            const result = await FuelRate.bulkWrite(operations);
            return {
                success: true,
                message: 'Fuel rates inserted/updated successfully',
                data: result
            };
        } catch (error) {
            throw new Error(`Error creating fuel rates: ${error.message}`);
        }
    }

    // Create single fuel rate
    async createFuelRate(fuelRateData) {
        try {
            const fuelRate = new FuelRate(fuelRateData);
            await fuelRate.save();
            return {
                success: true,
                message: 'Fuel rate created successfully',
                data: fuelRate
            };
        } catch (error) {
            throw new Error(`Error creating fuel rate: ${error.message}`);
        }
    }

    // Get all fuel rates
    async getAllFuelRates() {
        try {
            const fuelRates = await FuelRate.find().sort({ stateName: 1 });
            return {
                success: true,
                data: fuelRates
            };
        } catch (error) {
            throw new Error(`Error fetching fuel rates: ${error.message}`);
        }
    }

    // Get fuel rate by state name
    async getFuelRateByState(stateName) {
        try {
            const fuelRate = await FuelRate.findOne({
                stateName: { $regex: new RegExp(`^${stateName}$`, 'i') }
            });

            if (!fuelRate) {
                return {
                    success: false,
                    message: 'Fuel rate not found for this state'
                };
            }

            return {
                success: true,
                data: fuelRate
            };
        } catch (error) {
            throw new Error(`Error fetching fuel rate: ${error.message}`);
        }
    }

    // Get fuel rate by state name (case insensitive)
    async getFuelRateByStateName(stateName) {
        return this.getFuelRateByState(stateName);
    }

    // Update fuel rate
    async updateFuelRate(stateName, updateData) {
        try {
            const fuelRate = await FuelRate.findOneAndUpdate(
                { stateName: { $regex: new RegExp(`^${stateName}$`, 'i') } },
                { $set: updateData },
                { new: true }
            );

            if (!fuelRate) {
                return {
                    success: false,
                    message: 'Fuel rate not found for this state'
                };
            }

            return {
                success: true,
                message: 'Fuel rate updated successfully',
                data: fuelRate
            };
        } catch (error) {
            throw new Error(`Error updating fuel rate: ${error.message}`);
        }
    }

    // Delete fuel rate
    async deleteFuelRate(stateName) {
        try {
            const result = await FuelRate.findOneAndDelete({
                stateName: { $regex: new RegExp(`^${stateName}$`, 'i') }
            });

            if (!result) {
                return {
                    success: false,
                    message: 'Fuel rate not found for this state'
                };
            }

            return {
                success: true,
                message: 'Fuel rate deleted successfully'
            };
        } catch (error) {
            throw new Error(`Error deleting fuel rate: ${error.message}`);
        }
    }
}

module.exports = new FuelRateService();