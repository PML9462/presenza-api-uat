const httpStatus = require("http-status");
const ApiError = require("../utils/ApiError");
const { Expense } = require("../models/index");

const createExpense = async (expenseData) => {
    try {
        const expense = new Expense(expenseData);

        await expense.save();

        return expense;
    } catch (error) {
        throw new ApiError(
            httpStatus.status.INTERNAL_SERVER_ERROR,
            error.message
        );
    }
};
const getExpenses = async (filterQuery) => {
    try {
        const expenses = await Expense.find(filterQuery)
            .populate({
                path: "employee",
                select: "employeeCode fullName email department",
                populate: {
                    path: "department",
                    select: "name"
                }
            })
            .populate("approvedBy", "fullName")
            .lean();

        return expenses.map(expense => ({
            ...expense,
            employee: {
                ...expense.employee,
                departmentName: expense.employee?.department?.name || null,
                department: undefined, // or delete it
            }
        }));
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
    }
};
// const getExpenses = async (filterQuery) => {
//     try {
//         const expenses = await Expense.find(filterQuery)
//             .populate("employee", "employeeCode fullName email")
//             .populate("approvedBy", "fullName");

//         return expenses;
//     } catch (error) {
//         throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
//     }
// };
const approveExpense = async (expenseId, approverId) => {
    try {
        await Expense.findByIdAndUpdate(expenseId, { status: 'APPROVED', approvedBy: approverId });
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
    }
}
const rejectExpense = async (expenseId) => {
    try {
        await Expense.findByIdAndUpdate(expenseId, { status: 'REJECTED' });
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
    }
}
module.exports = {
    createExpense,
    getExpenses,
    approveExpense,
    rejectExpense
}