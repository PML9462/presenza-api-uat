const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const { Department } = require("../models/index");

const createDepartment = async (departmentData) => {
    try {
        const department = new Department(departmentData);
        await department.save();
        return department;
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
    }
}
const getDepartments = async (filterQuery) => {
    try {
        const departments = await Department.find(filterQuery);
        return departments;
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
    }
}

module.exports = {
    createDepartment,
    getDepartments
}
