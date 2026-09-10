const httpStatus = require("http-status");
const { ObjectId } = require('mongodb')
const catchAsync = require("../../utils/catchAsync");
const { employeeService } = require("../../services");

/* -------------------- Create Employee -------------------- */
const createEmployee = catchAsync(async (req, res) => {
  req.body["employeeCode"] = req.body.employeeCode.toUpperCase();
  const employee = await employeeService.createEmployee(req.body);

  return res.status(httpStatus.status.CREATED).json({
    success: true,
    message: "Employee created successfully",
    data: employee,
  });
});

const updateEmployee = catchAsync(async (req, res) => {
    const employee = await employeeService.updateEmployee(req.params.id, req.body);

    return res.status(httpStatus.status.OK).json({
        success: true,
        message: "Employee updated successfully",
        data: employee,
    });

})

// const getEmployees = catchAsync(async (req, res) => {
//     try {
//         const { departmentId } = req.query;

//         // let filterQuery = {};


//         // if (req.user.role === 'CEO') {
//         //     filterQuery._id = {
//         //         $ne: new ObjectId(req.user.employeeId)
//         //     };
//         // }

//         // if (req.user.role == 'MANAGER') {
//         //     filterQuery["reportingTo"] = new ObjectId(req.user.employeeId)
//         // }

//         // if (departmentId) {
//         //     filterQuery["department"] = new ObjectId(departmentId)
//         // }

//         let filterQuery = {
//             isActive: true
//         };

//         const departmentKeyExists = Object.prototype.hasOwnProperty.call(req.query, 'departmentId');

//         if (req.user.role === 'CEO' && !departmentKeyExists) {
//             filterQuery._id = {
//                 $ne: new ObjectId(req.user.employeeId)
//             };
//         }

//         if (req.user.role === 'MANAGER') {
//             filterQuery.reportingTo = new ObjectId(req.user.employeeId);
//         }

//         if (departmentId) {
//             filterQuery.department = new ObjectId(departmentId);
//         }
//         const employees = await employeeService.getEmployees(filterQuery);

//         return res.status(httpStatus.status.OK).json({
//             success: true,
//             message: "Employees fetched successfully",
//             data: employees,
//         });
//     } catch (error) {
//         return res.status(
//             error.statusCode || httpStatus.status.INTERNAL_SERVER_ERROR
//         ).json({
//             success: false,
//             message: error.message || "Something went wrong",
//         });
//     }
// })

const getEmployees = catchAsync(async (req, res) => {
    try {
        const { departmentId, isSystemProvided } = req.query;

        let filterQuery = {
            // isActive: true,
        };

        const departmentKeyExists = Object.prototype.hasOwnProperty.call(
            req.query,
            "departmentId"
        );

        const isSystemProvidedKeyExists = Object.prototype.hasOwnProperty.call(
            req.query,
            "isSystemProvided"
        );

        console.log("departmentKeyExists:", departmentKeyExists);

        if (req.user.role === "CEO" && !departmentKeyExists) {
            filterQuery._id = {
                $ne: new ObjectId(req.user.employeeId),
            };
        }

        if (isSystemProvidedKeyExists) {
            console.log("isSystemProvided:", isSystemProvided);

            filterQuery["systemInfo.isSystemProvided"] =
                isSystemProvided === "true";
        }

        if (req.user.role === "MANAGER") {
            filterQuery.reportingTo = new ObjectId(req.user.employeeId);
        }

        if (departmentId) {
            filterQuery.department = new ObjectId(departmentId);
        }

        console.log("filterQuery:", filterQuery);

        const employees = await employeeService.getEmployees(filterQuery);

        return res.status(httpStatus.status.OK).json({
            success: true,
            message: "Employees fetched successfully",
            data: employees,
        });
    } catch (error) {
        return res.status(
            error.statusCode || httpStatus.status.INTERNAL_SERVER_ERROR
        ).json({
            success: false,
            message: error.message || "Something went wrong",
        });
    }
});
const updateEmployeeStatus = catchAsync(async (req, res) => {
    const employee = await employeeService.updateEmployeeStatus(req.params.id, req.body.isActive);

    return res.status(httpStatus.status.OK).json({
        success: true,
        message: "Employee status updated successfully",
        data: employee,
    });

});
module.exports = {
    createEmployee,
    getEmployees,
    updateEmployee,
    updateEmployeeStatus
};