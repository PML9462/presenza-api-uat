const { ObjectId } = require('mongodb');
const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { expenseService,employeeService } = require("../../services/index");

// const getExpenses = async (req, res) => {
//     try {
//         const expenses = await expenseService.getExpenses();
//         return res.status(200).json({
//             message: 'Expenses retrieved successfully',
//             data: expenses,
//         });
//     } catch (error) {
//         console.error('Error retrieving expenses:', error);
//         return res.status(500).json({
//             message: 'Failed to retrieve expenses',
//             error: error.message,
//         });
//     }
// };

const getExpenses = async (req, res) => {
    try {
        const matchQuery = {};
        const employeeMatchQuery = {};
        
        if (req.user.role === 'MANAGER') {
            employeeMatchQuery["reportingTo"] = new ObjectId(req.user.employeeId);
        }

        const employees = await employeeService.getEmployees(employeeMatchQuery);
        const employeeIds = employees.map(emp => emp._id.toString());

        if (employeeIds.length > 0) {
            matchQuery.employee = { $in: employeeIds.map(id => new ObjectId(id)) };
        }

        const expenses = await expenseService.getExpenses(matchQuery);

        return res.status(httpStatus.status.OK).json({
            success: true,
            message: "Expenses fetched successfully",
            data: expenses,
        });
    } catch (error) {
        console.error('Error retrieving expenses:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve expenses',
            error: error.message,
        });
    }
};
const approveExpense = async (req, res) => {
    try {
        const expenseId = req.params.id;
        const approverId = req.user.employeeId; // Assuming the authenticated user's ID is available in req.user
        await expenseService.approveExpense(expenseId, approverId);
        return res.status(200).json({
            message: 'Expense approved successfully',
        });
    } catch (error) {
        console.error('Error approving expense:', error);
        return res.status(500).json({
            message: 'Failed to approve expense',
            error: error.message,
        });
    }
};

const rejectExpense = async (req, res) => {
    try {
        const expenseId = req.params.id;
        await expenseService.rejectExpense(expenseId);
        return res.status(200).json({
            message: 'Expense rejected successfully',
        });
    } catch (error) {
        console.error('Error rejecting expense:', error);
        return res.status(500).json({
            message: 'Failed to reject expense',
            error: error.message,
        });
    }
};
module.exports = {
    getExpenses,
    approveExpense,
    rejectExpense
};  