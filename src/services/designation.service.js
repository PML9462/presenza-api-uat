const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const { Designation } = require("../models/index");

const createDesignation = async (designationData) => {
    try {
        const designation = new Designation(designationData);
        await designation.save();
        return designation;
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
    }
}
const getDesignations = async (filterQuery) => {
    try {
        const designations = await Designation.find(filterQuery);
        return designations;
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
    }
}

module.exports = {
    createDesignation,
    getDesignations
}
