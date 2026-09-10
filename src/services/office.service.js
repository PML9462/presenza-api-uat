const httpStatus = require("http-status");
const { ObjectId } = require('mongodb')
const ApiError = require("../utils/ApiError");
const { Office } = require('../models/index');

const addOffice = async (officeData) => {
    try {
        return await Office.create(officeData)
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
    }
}
const getOffices = async () => {
    try {
        return await Office.find()
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
    }
}


module.exports = {
    addOffice,
    getOffices
}


