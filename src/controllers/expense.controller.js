const { ObjectId } = require('mongodb');
const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const ApiError = require("../utils/ApiError");
const mongoose = require("mongoose");
const { expenseService } = require("../services");


const getExpenses = catchAsync(async (req, res) => {

    let filterQuery = {};

    filterQuery["employee"] = new ObjectId(req.user.employeeId)

    const expenses = await expenseService.getExpenses(filterQuery);

    res.status(httpStatus.status.OK).json({
        message: "Expenses fetched successful",
        status: httpStatus.status.OK,
        data: expenses,
    });
})

const createExpense = catchAsync(async (req, res) => {
    let expenseData;

    try {
        expenseData = JSON.parse(req.body.jsonData);
    } catch (error) {
        throw new ApiError(
            httpStatus.status.BAD_REQUEST,
            "Invalid JSON data"
        );
    }

    // Validate employee
    if (!req.user?.employeeId) {
        throw new ApiError(
            httpStatus.status.UNAUTHORIZED,
            "Employee information not found"
        );
    }

    // Validate receipt
    if (!req.fileUrls?.image) {
        throw new ApiError(
            httpStatus.status.BAD_REQUEST,
            "Receipt is required"
        );
    }

    // Set server-side fields
    expenseData.employee = new mongoose.Types.ObjectId(
        req.user.employeeId
    );

    expenseData.receiptUrl = req.fileUrls.image;

    const createdExpense = await expenseService.createExpense(expenseData);

    res.status(httpStatus.status.CREATED).json({
        message: "Expense created successfully",
        status: httpStatus.status.CREATED,
        data: createdExpense,
    });
});

module.exports = {
    getExpenses,
    createExpense,
};
