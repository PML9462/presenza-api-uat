const httpStatus = require("http-status");
const moment = require("moment"); // add this if the file doesn't already require moment
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const ApiError = require("../utils/ApiError");
const { Department, Designation, Office, Employee, LeaveBalance } = require('../models/index');
const leaveTypeService = require('./leaveType.service')
// /* -------------------- Create Employee -------------------- */
// const createEmployee = async (data) => {
//   return Employee.create({
//     email: data.email,
//     userType: data.userType || 3,
//     authStep: 'SEND_OTP',
//     office: "698c0c9bd5061170359fd420",
//     shiftPolicy: "698c148807c8e4ef5e85eb86",
//     weeklyOffPolicy: "698c1dfad5061170359fd438",
//   });
// };

/* -------------------- Get Employee -------------------- */
const getEmployeeByEmail = async (email) => {
  try {
    return Employee.findOne({ email });
  } catch (error) {
    throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
  }
};

/* -------------------- Get Employee -------------------- */
const getEmployeeByCode = async (employeeCode) => {
  try {
    return Employee.findOne({ employeeCode });
  } catch (error) {
    throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
  }
};

const getEmployeeById = async (id) => {
  try {
    return Employee.findById(id);
  } catch (error) {
    throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)

  }
};

const getEmployeeByDeviceName = async (deviceName) => {
  return Employee.findOne({ "systemInfo.deviceName": deviceName });
}

/* -------------------- Update Auth Step -------------------- */
const updateAuthStep = async (employeeId, step) => {
  return Employee.findByIdAndUpdate(
    employeeId,
    { authStep: step },
    { new: true }
  );
};

/* -------------------- Update Last Login -------------------- */
const updateLastLogin = async (employeeId) => {
  return Employee.findByIdAndUpdate(
    employeeId,
    { lastLoginAt: new Date() },
    { new: true }
  );
};

/* -------------------- Save Refresh Token -------------------- */
const saveRefreshToken = async (employeeId, refreshToken) => {
  return Employee.findByIdAndUpdate(
    employeeId,
    { refreshToken },
    { new: true }
  ).select('+refreshToken');
};

/* -------------------- Clear Refresh Token -------------------- */
const clearRefreshToken = async (employeeId) => {
  return Employee.findByIdAndUpdate(
    employeeId,
    { refreshToken: null },
    { new: true }
  );
};

/* -------------------- Update Profile -------------------- */
const updateEmployeeProfile = async (employeeId, data) => {
  const updateData = {};

  if (data.fullName !== undefined) updateData.fullName = data.fullName;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.department !== undefined) updateData.department = data.department;
  if (data.designation !== undefined) updateData.designation = data.designation;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  return Employee.findByIdAndUpdate(
    employeeId,
    updateData,
    { new: true }
  );
};

/* -------------------- Check Refresh Token -------------------- */
const validateRefreshToken = async (employeeId, refreshToken) => {
  const employee = await Employee.findById(employeeId).select('+refreshToken');

  if (!employee || !employee.refreshToken) {
    return false;
  }

  return employee.refreshToken === refreshToken;
};

/**
 * Frontend sends joiningDate as UTC midnight (e.g. 2026-07-17T00:00:00.000+00:00),
 * which is ambiguous/ends up looking like "16 July, late night IST" in some
 * comparisons. This keeps the calendar date exactly as sent from the frontend,
 * but stamps it with the real current time-of-day instead of 00:00:00, e.g.
 * 2026-07-17T00:00:00.000+00:00 -> 2026-07-17T09:14:21.561+00:00
 */
const stampWithCurrentTime = (inputDate) => {
  const base = inputDate ? new Date(inputDate) : new Date();
  const now = new Date();

  return new Date(Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds()
  ));
};

// /* -------------------- Create Employee -------------------- */
// const createEmployee = async (data) => {
//   const {
//     email,
//     employeeCode,
//     department,
//     designation,
//     office,
//     shiftPolicy,
//     weeklyOffPolicy,
//     reportingTo
//   } = data;

//   /* ---------- 1. Required field validation ---------- */
//   if (!email || !department || !designation || !office) {
//     const error = new Error(
//       "Email, department, designation, and office are required"
//     );
//     error.statusCode = httpStatus.status.BAD_REQUEST;
//     throw error;
//   }

//   /* ---------- 2. Employee code uniqueness check (single check, no duplicate query) ---------- */
//   if (employeeCode) {
//     const existingCode = await Employee.findOne({ employeeCode });
//     if (existingCode) {
//       const error = new Error("Employee code already exists");
//       error.statusCode = httpStatus.status.CONFLICT;
//       throw error;
//     }
//   }

//   /* ---------- 3. Department existence check ---------- */
//   const departmentExists = await Department.findById(department);
//   if (!departmentExists) {
//     const error = new Error("Invalid department selected");
//     error.statusCode = httpStatus.status.BAD_REQUEST;
//     throw error;
//   }

//   /* ---------- 4. Designation existence & department mapping ---------- */
//   const designationExists = await Designation.findById(designation);
//   if (!designationExists) {
//     const error = new Error("Invalid designation selected");
//     error.statusCode = httpStatus.status.BAD_REQUEST;
//     throw error;
//   }

//   if (
//     designationExists.department &&
//     !designationExists.department.equals(department)
//   ) {
//     const error = new Error(
//       "Designation does not belong to selected department"
//     );
//     error.statusCode = httpStatus.status.BAD_REQUEST;
//     throw error;
//   }

//   /* ---------- 5. Office existence check ---------- */
//   const officeExists = await Office.findById(office);
//   if (!officeExists) {
//     const error = new Error("Invalid office selected");
//     error.statusCode = httpStatus.status.BAD_REQUEST;
//     throw error;
//   }

//   /* ---------- 6. Reporting manager promotion ---------- */
//   if (reportingTo) {
//     const manager = await Employee.findById(reportingTo).populate("designation");

//     if (!manager) {
//       throw new ApiError(
//         httpStatus.status.NOT_FOUND,
//         "Reporting manager not found"
//       );
//     }

//     const isCEO =
//       manager.designation &&
//       manager.designation.title &&
//       manager.designation.title.toUpperCase() === "CEO";

//     if (!isCEO && manager.role === "EMPLOYEE") {
//       manager.role = "MANAGER";

//       if (!manager.password) {
//         manager.password = await bcrypt.hash("Pml@123", 10);
//       }

//       // Keep the date as-is, but stamp with current time instead of 00:00:00.
//       manager.joiningDate = stampWithCurrentTime(manager.joiningDate || new Date());

//       manager.systemInfo = manager.systemInfo || {};
//       manager.systemInfo.isSystemProvided =
//         manager.systemInfo.isSystemProvided || false;

//       if (!manager.systemInfo.isSystemProvided) {
//         manager.systemInfo.systemType = undefined;
//         manager.systemInfo.operatingSystem = undefined;
//         manager.systemInfo.deviceName = undefined;
//         manager.systemInfo.brand = undefined;
//         manager.systemInfo.serialNumber = undefined;
//       }

//       await manager.save();
//     }
//   }

//   if (designationExists.title === "CEO") {
//     if (!data.password) {
//       data.password = await bcrypt.hash("Pml@123", 10);
//     }
//     // Same treatment for the new CEO record.
//     data.joiningDate = stampWithCurrentTime(data.joiningDate || new Date());
//   }

//   // Clone data so we can safely mutate
//   const payload = { ...data };
//   payload.systemInfo = payload.systemInfo || {};

//   if (!payload.systemInfo.isSystemProvided) {
//     delete payload.systemInfo.systemType;
//     delete payload.systemInfo.operatingSystem;
//     delete payload.systemInfo.deviceName;
//     delete payload.systemInfo.brand;
//     delete payload.systemInfo.serialNumber;
//   }

//   // Whatever joiningDate ends up on the payload (frontend-supplied for a
//   // regular employee, or set above for the CEO branch), keep its calendar
//   // date but stamp it with the real current time instead of 00:00:00.
//   payload.joiningDate = stampWithCurrentTime(payload.joiningDate);

//   /* ---------- 7. Create employee + leave balances atomically ---------- */
//   // Using a transaction so that if leave balance creation fails/conflicts
//   // (e.g. duplicate key from the unique index), the employee record
//   // doesn't get created "orphaned" without balances.
//   const session = await mongoose.startSession();
//   let employee;

//   try {
//     await session.withTransaction(async () => {
//       const created = await Employee.create(
//         [
//           {
//             ...payload,
//             authStep: "SEND_OTP",
//             isEmailVerified: false,
//           },
//         ],
//         { session }
//       );

//       employee = created[0];

//       await leaveTypeService.createMonthlyLeaveBalances(
//         employee._id,
//         employee.joiningDate,
//         session
//       );
//     });
//   } finally {
//     await session.endSession();
//   }

//   /* ---------- 8. Remove sensitive fields ---------- */
//   const employeeObj = employee.toObject();
//   delete employeeObj.refreshToken;

//   return employeeObj;
// };

/* -------------------- Create Employee -------------------- */
const createEmployee = async (data) => {
  const {
    email,
    employeeCode,
    department,
    designation,
    office,
    shiftPolicy,
    weeklyOffPolicy,
    reportingTo,
    role // Make sure role is destructured from data
  } = data;

  /* ---------- 1. Required field validation ---------- */
  if (!email || !department || !designation || !office) {
    const error = new Error(
      "Email, department, designation, and office are required"
    );
    error.statusCode = httpStatus.status.BAD_REQUEST;
    throw error;
  }

  /* ---------- 2. Employee code uniqueness check (single check, no duplicate query) ---------- */
  if (employeeCode) {
    const existingCode = await Employee.findOne({ employeeCode });
    if (existingCode) {
      const error = new Error("Employee code already exists");
      error.statusCode = httpStatus.status.CONFLICT;
      throw error;
    }
  }

  /* ---------- 3. Department existence check ---------- */
  const departmentExists = await Department.findById(department);
  if (!departmentExists) {
    const error = new Error("Invalid department selected");
    error.statusCode = httpStatus.status.BAD_REQUEST;
    throw error;
  }

  /* ---------- 4. Designation existence & department mapping ---------- */
  const designationExists = await Designation.findById(designation);
  if (!designationExists) {
    const error = new Error("Invalid designation selected");
    error.statusCode = httpStatus.status.BAD_REQUEST;
    throw error;
  }

  if (
    designationExists.department &&
    !designationExists.department.equals(department)
  ) {
    const error = new Error(
      "Designation does not belong to selected department"
    );
    error.statusCode = httpStatus.status.BAD_REQUEST;
    throw error;
  }

  /* ---------- 5. Office existence check ---------- */
  const officeExists = await Office.findById(office);
  if (!officeExists) {
    const error = new Error("Invalid office selected");
    error.statusCode = httpStatus.status.BAD_REQUEST;
    throw error;
  }

  /* ---------- 6. Reporting manager promotion ---------- */
  if (reportingTo) {
    const manager = await Employee.findById(reportingTo).populate("designation");

    if (!manager) {
      throw new ApiError(
        httpStatus.status.NOT_FOUND,
        "Reporting manager not found"
      );
    }

    const isCEO =
      manager.designation &&
      manager.designation.title &&
      manager.designation.title.toUpperCase() === "CEO";

    if (!isCEO && manager.role === "EMPLOYEE") {
      manager.role = "MANAGER";

      if (!manager.password) {
        manager.password = await bcrypt.hash("Pml@123", 10);
      }

      // Keep the date as-is, but stamp with current time instead of 00:00:00.
      manager.joiningDate = stampWithCurrentTime(manager.joiningDate || new Date());

      manager.systemInfo = manager.systemInfo || {};
      manager.systemInfo.isSystemProvided =
        manager.systemInfo.isSystemProvided || false;

      if (!manager.systemInfo.isSystemProvided) {
        manager.systemInfo.systemType = undefined;
        manager.systemInfo.operatingSystem = undefined;
        manager.systemInfo.deviceName = undefined;
        manager.systemInfo.brand = undefined;
        manager.systemInfo.serialNumber = undefined;
      }

      await manager.save();
    }
  }

  /* ---------- Password handling based on role and designation ---------- */
  // Clone data so we can safely mutate
  const payload = { ...data };

  // Handle password based on role
  if (payload.role === "ADMIN") {
    // For ADMIN role, use Password@123
    payload.password = await bcrypt.hash("Password@123", 10);
  } else if (designationExists.title === "CEO") {
    // For CEO, use Pml@123
    if (!payload.password) {
      payload.password = await bcrypt.hash("Pml@123", 10);
    }
    // Same treatment for the new CEO record.
    payload.joiningDate = stampWithCurrentTime(payload.joiningDate || new Date());
  } else if (!payload.password) {
    // For other employees, you might want to set a default or let them set their own
    // If no password is provided, you could set a default or throw an error
    payload.password = await bcrypt.hash("Pml@123", 10);
  }

  // Handle systemInfo
  payload.systemInfo = payload.systemInfo || {};

  if (!payload.systemInfo.isSystemProvided) {
    delete payload.systemInfo.systemType;
    delete payload.systemInfo.operatingSystem;
    delete payload.systemInfo.deviceName;
    delete payload.systemInfo.brand;
    delete payload.systemInfo.serialNumber;
  }

  // Whatever joiningDate ends up on the payload, stamp it with current time
  payload.joiningDate = stampWithCurrentTime(payload.joiningDate || new Date());

  /* ---------- 7. Create employee + leave balances atomically ---------- */
  const session = await mongoose.startSession();
  let employee;

  try {
    await session.withTransaction(async () => {
      const created = await Employee.create(
        [
          {
            ...payload,
            authStep: "SEND_OTP",
            isEmailVerified: false,
          },
        ],
        { session }
      );

      employee = created[0];

      await leaveTypeService.createMonthlyLeaveBalances(
        employee._id,
        employee.joiningDate,
        session
      );
    });
  } finally {
    await session.endSession();
  }

  /* ---------- 8. Remove sensitive fields ---------- */
  const employeeObj = employee.toObject();
  delete employeeObj.refreshToken;

  return employeeObj;
};

const updateEmployee = async (employeeId, data) => {
  try {
    const employee = await Employee.findById(employeeId).populate("designation");

    if (!employee) {
      throw new ApiError(
        httpStatus.status.NOT_FOUND,
        "Employee not found"
      );
    }

    /* ----------------------------------------------------
       Password handling based on role
    ----------------------------------------------------- */
    const isEmployeeCEO =
      employee.designation &&
      employee.designation.title &&
      employee.designation.title.toUpperCase() === "CEO";

    const isEmployeeADMIN = employee.role === "ADMIN";

    // Handle password for ADMIN
    if (isEmployeeADMIN) {
      if (!employee.password) {
        employee.password = await bcrypt.hash("Password@123", 10);
      }
      employee.joiningDate = employee.joiningDate || new Date();
      await employee.save();
    }
    // Handle password for CEO
    else if (isEmployeeCEO) {
      if (!employee.password) {
        employee.password = await bcrypt.hash("Pml@202627", 10);
      }
      employee.joiningDate = employee.joiningDate || new Date();
      await employee.save();
    }

    /* ----------------------------------------------------
       Validate reporting manager
    ----------------------------------------------------- */
    if (data.reportingTo) {
      const manager = await Employee.findById(data.reportingTo).populate(
        "designation"
      );

      if (!manager) {
        throw new ApiError(
          httpStatus.status.NOT_FOUND,
          "Reporting manager not found"
        );
      }

      const isManagerCEO =
        manager.designation &&
        manager.designation.title &&
        manager.designation.title.toUpperCase() === "CEO";

      const isManagerADMIN = manager.role === "ADMIN";

      if (!isManagerCEO && !isManagerADMIN && manager.role === "EMPLOYEE") {
        manager.role = "MANAGER";

        if (!manager.password) {
          manager.password = await bcrypt.hash("Manager@Pml@2024", 10);
        }

        manager.joiningDate = manager.joiningDate || new Date();
        await manager.save();
      }
    }

    /* ----------------------------------------------------
       Update allowed fields
    ----------------------------------------------------- */
    const updatableFields = [
      "fullName",
      "email",
      "employeeCode",
      "department",
      "designation",
      "office",
      "reportingTo",
      "isActive",
      "role",
      "systemInfo", // Add systemInfo to updatable fields
    ];

    updatableFields.forEach((field) => {
      if (data[field] !== undefined) {
        if (field === "systemInfo") {
          // Merge systemInfo instead of replacing
          employee.systemInfo = {
            ...employee.systemInfo,
            ...data.systemInfo
          };
        } else {
          employee[field] = data[field];
        }
      }
    });

    // If role is being updated to ADMIN, set the ADMIN password
    if (data.role === "ADMIN") {
      employee.password = await bcrypt.hash("Password@123", 10);
    }
    // If role is being updated to CEO and it's not already handled
    else if (data.role === "CEO" && !isEmployeeCEO) {
      employee.password = await bcrypt.hash("Pml@202627", 10);
    }

    await employee.save();

    return await Employee.findById(employee._id)
      .populate("department")
      .populate("designation")
      .populate("office")
      .populate("reportingTo");

  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.status.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};
// const updateEmployee = async (employeeId, data) => {
//   try {
//     const employee = await Employee.findById(employeeId).populate("designation");

//     if (!employee) {
//       throw new ApiError(
//         httpStatus.status.NOT_FOUND,
//         "Employee not found"
//       );
//     }

//     /* ----------------------------------------------------
//        Password handling based on role
//     ----------------------------------------------------- */
//     const isEmployeeCEO =
//       employee.designation &&
//       employee.designation.title &&
//       employee.designation.title.toUpperCase() === "CEO";

//     // Check if employee is ADMIN (based on role field)
//     const isEmployeeADMIN = employee.role === "ADMIN";

//     // Handle password for ADMIN
//     if (isEmployeeADMIN) {
//       if (!employee.password) {
//         employee.password = await bcrypt.hash("Password@123", 10);
//       }

//       employee.joiningDate = employee.joiningDate || new Date();

//       employee.systemInfo = employee.systemInfo || {};
//       employee.systemInfo.isSystemProvided =
//         employee.systemInfo.isSystemProvided || false;

//       if (!employee.systemInfo.isSystemProvided) {
//         employee.systemInfo.systemType = undefined;
//         employee.systemInfo.operatingSystem = undefined;
//         employee.systemInfo.deviceName = undefined;
//         employee.systemInfo.brand = undefined;
//         employee.systemInfo.serialNumber = undefined;
//       }

//       await employee.save();
//     }
//     // Handle password for CEO
//     else if (isEmployeeCEO) {
//       // CEO specific password
//       if (!employee.password) {
//         employee.password = await bcrypt.hash("Pml@202627", 10);
//       }

//       employee.joiningDate = employee.joiningDate || new Date();

//       employee.systemInfo = employee.systemInfo || {};
//       employee.systemInfo.isSystemProvided =
//         employee.systemInfo.isSystemProvided || false;

//       if (!employee.systemInfo.isSystemProvided) {
//         employee.systemInfo.systemType = undefined;
//         employee.systemInfo.operatingSystem = undefined;
//         employee.systemInfo.deviceName = undefined;
//         employee.systemInfo.brand = undefined;
//         employee.systemInfo.serialNumber = undefined;
//       }

//       await employee.save();
//     }

//     /* ----------------------------------------------------
//        Validate reporting manager
//     ----------------------------------------------------- */
//     if (data.reportingTo) {
//       const manager = await Employee.findById(data.reportingTo).populate(
//         "designation"
//       );

//       if (!manager) {
//         throw new ApiError(
//           httpStatus.status.NOT_FOUND,
//           "Reporting manager not found"
//         );
//       }

//       const isManagerCEO =
//         manager.designation &&
//         manager.designation.title &&
//         manager.designation.title.toUpperCase() === "CEO";

//       const isManagerADMIN = manager.role === "ADMIN";

//       // Don't promote ADMIN or CEO, only promote normal employees
//       if (!isManagerCEO && !isManagerADMIN && manager.role === "EMPLOYEE") {
//         manager.role = "MANAGER";

//         // Manager (non-CEO, non-ADMIN) specific password
//         if (!manager.password) {
//           manager.password = await bcrypt.hash("Manager@Pml@2024", 10);
//         }

//         manager.joiningDate = manager.joiningDate || new Date();

//         manager.systemInfo = manager.systemInfo || {};
//         manager.systemInfo.isSystemProvided =
//           manager.systemInfo.isSystemProvided || false;

//         if (!manager.systemInfo.isSystemProvided) {
//           manager.systemInfo.systemType = undefined;
//           manager.systemInfo.operatingSystem = undefined;
//           manager.systemInfo.deviceName = undefined;
//           manager.systemInfo.brand = undefined;
//           manager.systemInfo.serialNumber = undefined;
//         }

//         await manager.save();
//       }
//     }

//     /* ----------------------------------------------------
//        Update allowed fields
//     ----------------------------------------------------- */
//     const updatableFields = [
//       "fullName",
//       "email",
//       "employeeCode",
//       "department",
//       "designation",
//       "office",
//       "reportingTo",
//       "isActive",
//       "role", // Added role to updatable fields if you want to allow role updates
//     ];

//     updatableFields.forEach((field) => {
//       if (data[field] !== undefined) {
//         employee[field] = data[field];
//       }
//     });

//     // If role is being updated to ADMIN, set the ADMIN password
//     if (data.role === "ADMIN") {
//       employee.password = await bcrypt.hash("Password@123", 10);
//     }
//     // If role is being updated to CEO and it's not already handled
//     else if (data.role === "CEO" && !isEmployeeCEO) {
//       employee.password = await bcrypt.hash("Pml@202627", 10);
//     }

//     await employee.save();

//     return await Employee.findById(employee._id)
//       .populate("department")
//       .populate("designation")
//       .populate("office")
//       .populate("reportingTo");

//   } catch (error) {
//     if (error instanceof ApiError) {
//       throw error;
//     }

//     throw new ApiError(
//       httpStatus.status.INTERNAL_SERVER_ERROR,
//       error.message
//     );
//   }
// };

// const updateEmployee = async (employeeId, data) => {
//   try {
//     const employee = await Employee.findById(employeeId).populate("designation");

//     if (!employee) {
//       throw new ApiError(
//         httpStatus.status.NOT_FOUND,
//         "Employee not found"
//       );
//     }

//     /* ----------------------------------------------------
//        If employee being updated is CEO, ensure credentials
//     ----------------------------------------------------- */
//     const isEmployeeCEO =
//       employee.designation &&
//       employee.designation.title &&
//       employee.designation.title.toUpperCase() === "CEO";

//     if (isEmployeeCEO) {
//       // CEO specific password
//       if (!employee.password) {
//         employee.password = await bcrypt.hash("Pml@202627", 10); // Different password for CEO
//       }

//       employee.joiningDate = employee.joiningDate || new Date();

//       employee.systemInfo = employee.systemInfo || {};
//       employee.systemInfo.isSystemProvided =
//         employee.systemInfo.isSystemProvided || false;

//       if (!employee.systemInfo.isSystemProvided) {
//         employee.systemInfo.systemType = undefined;
//         employee.systemInfo.operatingSystem = undefined;
//         employee.systemInfo.deviceName = undefined;
//         employee.systemInfo.brand = undefined;
//         employee.systemInfo.serialNumber = undefined;
//       }

//       await employee.save();
//     }

//     /* ----------------------------------------------------
//        Validate reporting manager
//     ----------------------------------------------------- */
//     if (data.reportingTo) {
//       const manager = await Employee.findById(data.reportingTo).populate(
//         "designation"
//       );

//       if (!manager) {
//         throw new ApiError(
//           httpStatus.status.NOT_FOUND,
//           "Reporting manager not found"
//         );
//       }

//       const isManagerCEO =
//         manager.designation &&
//         manager.designation.title &&
//         manager.designation.title.toUpperCase() === "CEO";

//       // Promote only normal employees
//       if (!isManagerCEO && manager.role === "EMPLOYEE") {
//         manager.role = "MANAGER";

//         // Manager (non-CEO) specific password
//         if (!manager.password) {
//           manager.password = await bcrypt.hash("Manager@Pml@2024", 10); // Different password for managers
//         }

//         manager.joiningDate = manager.joiningDate || new Date();

//         manager.systemInfo = manager.systemInfo || {};
//         manager.systemInfo.isSystemProvided =
//           manager.systemInfo.isSystemProvided || false;

//         if (!manager.systemInfo.isSystemProvided) {
//           manager.systemInfo.systemType = undefined;
//           manager.systemInfo.operatingSystem = undefined;
//           manager.systemInfo.deviceName = undefined;
//           manager.systemInfo.brand = undefined;
//           manager.systemInfo.serialNumber = undefined;
//         }

//         await manager.save();
//       }
//     }

//     /* ----------------------------------------------------
//        Update allowed fields
//     ----------------------------------------------------- */
//     const updatableFields = [
//       "fullName",
//       "email",
//       "employeeCode",
//       "department",
//       "designation",
//       "office",
//       "reportingTo",
//       "isActive",
//     ];

//     updatableFields.forEach((field) => {
//       if (data[field] !== undefined) {
//         employee[field] = data[field];
//       }
//     });

//     await employee.save();

//     return await Employee.findById(employee._id)
//       .populate("department")
//       .populate("designation")
//       .populate("office")
//       .populate("reportingTo");

//   } catch (error) {
//     if (error instanceof ApiError) {
//       throw error;
//     }

//     throw new ApiError(
//       httpStatus.status.INTERNAL_SERVER_ERROR,
//       error.message
//     );
//   }
// };
const getEmployees = async (filterQuery) => {
  try {
    return await Employee.aggregate([
      {
        $match: filterQuery,
      },

      {
        $lookup: {
          from: "departments",
          localField: "department",
          foreignField: "_id",
          as: "department",
        },
      },
      {
        $unwind: {
          path: "$department",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: "designations",
          localField: "designation",
          foreignField: "_id",
          as: "designation",
        },
      },
      {
        $unwind: {
          path: "$designation",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: "employees",
          localField: "reportingTo",
          foreignField: "_id",
          as: "reportingManager",
        },
      },
      {
        $unwind: {
          path: "$reportingManager",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Active employees first, inactive employees last
      {
        $sort: {
          isActive: -1,
          fullName: 1, // optional: alphabetical within active/inactive
        },
      },

      {
        $project: {
          _id: 1,
          fullName: 1,
          email: 1,
          employeeCode: 1,
          joiningDate: 1,

          departmentId: "$department._id",
          department: "$department.name",
          designation: "$designation.title",
          designationId: "$designation._id",

          office: 1,
          shiftPolicy: 1,
          weeklyOffPolicy: 1,
          isActive: 1,
          systemInfo: 1,

          reportingTo: {
            _id: "$reportingManager._id",
            name: "$reportingManager.fullName",
            email: "$reportingManager.email",
          },
        },
      },
    ]);
  } catch (error) {
    throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
  }
};

// const getEmployees = async (filterQuery) => {

//   try {
//     return await Employee.aggregate([
//       {
//         $match: filterQuery,
//       },

//       {
//         $lookup: {
//           from: "departments",
//           localField: "department",
//           foreignField: "_id",
//           as: "department",
//         },
//       },
//       {
//         $unwind: {
//           path: "$department",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "designations",
//           localField: "designation",
//           foreignField: "_id",
//           as: "designation",
//         },
//       },
//       {
//         $unwind: {
//           path: "$designation",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "employees",
//           localField: "reportingTo",
//           foreignField: "_id",
//           as: "reportingManager",
//         },
//       },
//       {
//         $unwind: {
//           path: "$reportingManager",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $project: {
//           _id: 1,
//           fullName: 1,
//           email: 1,
//           employeeCode: 1,
//           joiningDate: 1,

//           departmentId: "$department._id",
//           department: "$department.name",
//           designation: "$designation.title",


//           designationId: "$designation._id",
//           office: 1,
//           shiftPolicy: 1,
//           weeklyOffPolicy: 1,
//           isActive: 1,

//           reportingTo: {
//             _id: "$reportingManager._id",
//             name: "$reportingManager.fullName",
//             email: "$reportingManager.email",
//           },
//         },
//       },
//     ])
//   } catch (error) {
//     throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
//   }

// };
// const getEmployeeProfile = async (filterQuery) => {
//   try {
//     return await Employee.aggregate([
//       {
//         $match: filterQuery,
//       },

//       {
//         $lookup: {
//           from: "departments",
//           localField: "department",
//           foreignField: "_id",
//           as: "department",
//         },
//       },
//       {
//         $unwind: {
//           path: "$department",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "designations",
//           localField: "designation",
//           foreignField: "_id",
//           as: "designation",
//         },
//       },
//       {
//         $unwind: {
//           path: "$designation",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "employees",
//           localField: "reportingTo",
//           foreignField: "_id",
//           as: "reportingManager",
//         },
//       },
//       {
//         $unwind: {
//           path: "$reportingManager",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "office",
//           localField: "office",
//           foreignField: "_id",
//           as: "branch",
//         },
//       },
//       {
//         $unwind: {
//           path: "$branch",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       // 🔥 UPDATED LEAVE LOOKUP (EL + SL)
//       {
//         $lookup: {
//           from: "leavebalances",
//           let: { employeeId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: ["$employeeId", "$$employeeId"],
//                 },
//               },
//             },
//             {
//               $lookup: {
//                 from: "leavetypes",
//                 localField: "leaveTypeId",
//                 foreignField: "_id",
//                 as: "leaveType",
//               },
//             },
//             {
//               $unwind: "$leaveType",
//             },
//             {
//               $group: {
//                 _id: "$leaveType.code",
//                 totalUsed: { $sum: "$used" },
//                 totalRemaining: { $sum: "$remaining" },
//               },
//             },
//           ],
//           as: "leaveSummary",
//         },
//       },

//       // 🔥 MAP EL & SL
//       {
//         $addFields: {
//           earnedLeave: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$leaveSummary",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "EL"] },
//                 },
//               },
//               0,
//             ],
//           },
//           shortLeave: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$leaveSummary",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "SL"] },
//                 },
//               },
//               0,
//             ],
//           },
//         },
//       },

//       {
//         $project: {
//           _id: 1,
//           fullName: 1,
//           email: 1,
//           employeeCode: 1,

//           department: "$department.name",
//           designation: "$designation.title",

//           branch: "$branch.name",

//           reportingTo: {
//             _id: "$reportingManager._id",
//             name: "$reportingManager.fullName",
//             email: "$reportingManager.email",
//           },

//           // ✅ Earned Leave
//           totalLeaveUsed: { $ifNull: ["$earnedLeave.totalUsed", 0] },
//           totalLeaveRemaining: { $ifNull: ["$earnedLeave.totalRemaining", 0] },

//           // ✅ Short Leave
//           totalShortLeaveUsed: { $ifNull: ["$shortLeave.totalUsed", 0] },
//           totalShortLeaveRemaining: {
//             $ifNull: ["$shortLeave.totalRemaining", 0],
//           },
//         },
//       },
//     ]);
//   } catch (error) {
//     throw new ApiError(
//       httpStatus.status.INTERNAL_SERVER_ERROR,
//       error.message
//     );
//   }
// };


// const getEmployeeProfile = async (filterQuery) => {
//   try {
//     return await Employee.aggregate([
//       {
//         $match: filterQuery,
//       },

//       {
//         $lookup: {
//           from: "departments",
//           localField: "department",
//           foreignField: "_id",
//           as: "department",
//         },
//       },
//       {
//         $unwind: {
//           path: "$department",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "designations",
//           localField: "designation",
//           foreignField: "_id",
//           as: "designation",
//         },
//       },
//       {
//         $unwind: {
//           path: "$designation",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "employees",
//           localField: "reportingTo",
//           foreignField: "_id",
//           as: "reportingManager",
//         },
//       },
//       {
//         $unwind: {
//           path: "$reportingManager",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "office",
//           localField: "office",
//           foreignField: "_id",
//           as: "branch",
//         },
//       },
//       {
//         $unwind: {
//           path: "$branch",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       // 🔥 TOTAL LEAVE (ALL MONTHS)
//       {
//         $lookup: {
//           from: "leavebalances",
//           let: { employeeId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: ["$employeeId", "$$employeeId"],
//                 },
//               },
//             },
//             {
//               $lookup: {
//                 from: "leavetypes",
//                 localField: "leaveTypeId",
//                 foreignField: "_id",
//                 as: "leaveType",
//               },
//             },
//             {
//               $unwind: "$leaveType",
//             },
//             {
//               $group: {
//                 _id: "$leaveType.code",
//                 totalUsed: { $sum: "$used" },
//                 totalRemaining: { $sum: "$remaining" },
//               },
//             },
//           ],
//           as: "leaveSummary",
//         },
//       },

//       // 🔥 CURRENT MONTH LEAVE
//       {
//         $lookup: {
//           from: "leavebalances",
//           let: { employeeId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     { $eq: ["$employeeId", "$$employeeId"] },
//                     { $eq: ["$month", new Date().getMonth() + 1] },
//                     { $eq: ["$year", new Date().getFullYear()] },
//                   ],
//                 },
//               },
//             },
//             {
//               $lookup: {
//                 from: "leavetypes",
//                 localField: "leaveTypeId",
//                 foreignField: "_id",
//                 as: "leaveType",
//               },
//             },
//             {
//               $unwind: "$leaveType",
//             },
//             {
//               $group: {
//                 _id: "$leaveType.code",
//                 used: { $sum: "$used" },
//                 remaining: { $sum: "$remaining" },
//               },
//             },
//           ],
//           as: "currentMonthLeave",
//         },
//       },

//       // 🔥 MAP EL & SL (TOTAL)
//       {
//         $addFields: {
//           earnedLeave: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$leaveSummary",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "EL"] },
//                 },
//               },
//               0,
//             ],
//           },
//           shortLeave: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$leaveSummary",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "SL"] },
//                 },
//               },
//               0,
//             ],
//           },

//           currentMonthEL: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$currentMonthLeave",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "EL"] },
//                 },
//               },
//               0,
//             ],
//           },
//           currentMonthSL: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$currentMonthLeave",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "SL"] },
//                 },
//               },
//               0,
//             ],
//           },
//         },
//       },

//       {
//         $project: {
//           _id: 1,
//           fullName: 1,
//           email: 1,
//           employeeCode: 1,

//           department: "$department.name",
//           designation: "$designation.title",
//           branch: "$branch.name",

//           reportingTo: {
//             _id: "$reportingManager._id",
//             name: "$reportingManager.fullName",
//             email: "$reportingManager.email",
//           },

//           // ✅ TOTAL EL
//           totalLeaveUsed: { $ifNull: ["$earnedLeave.totalUsed", 0] },
//           totalLeaveRemaining: { $ifNull: ["$earnedLeave.totalRemaining", 0] },
//           totalLeave: {
//             $add: [
//               { $ifNull: ["$earnedLeave.totalUsed", 0] },
//               { $ifNull: ["$earnedLeave.totalRemaining", 0] },
//             ],
//           },

//           // ✅ TOTAL SL
//           totalShortLeaveUsed: { $ifNull: ["$shortLeave.totalUsed", 0] },
//           totalShortLeaveRemaining: {
//             $ifNull: ["$shortLeave.totalRemaining", 0],
//           },
//           totalShortLeave: {
//             $add: [
//               { $ifNull: ["$shortLeave.totalUsed", 0] },
//               { $ifNull: ["$shortLeave.totalRemaining", 0] },
//             ],
//           },

//           // ✅ CURRENT MONTH EL
//           currentMonthLeaveUsed: {
//             $ifNull: ["$currentMonthEL.used", 0],
//           },
//           currentMonthLeaveRemaining: {
//             $ifNull: ["$currentMonthEL.remaining", 0],
//           },

//           // ✅ CURRENT MONTH SL
//           currentMonthShortLeaveUsed: {
//             $ifNull: ["$currentMonthSL.used", 0],
//           },
//           currentMonthShortLeaveRemaining: {
//             $ifNull: ["$currentMonthSL.remaining", 0],
//           },
//         },
//       },
//     ]);
//   } catch (error) {
//     throw new ApiError(
//       httpStatus.status.INTERNAL_SERVER_ERROR,
//       error.message
//     );
//   }
// };

const getEmployeeProfile = async (filterQuery) => {
  try {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    return await Employee.aggregate([
      {
        $match: filterQuery,
      },

      {
        $lookup: {
          from: "departments",
          localField: "department",
          foreignField: "_id",
          as: "department",
        },
      },
      {
        $unwind: {
          path: "$department",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: "designations",
          localField: "designation",
          foreignField: "_id",
          as: "designation",
        },
      },
      {
        $unwind: {
          path: "$designation",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: "employees",
          localField: "reportingTo",
          foreignField: "_id",
          as: "reportingManager",
        },
      },
      {
        $unwind: {
          path: "$reportingManager",
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $lookup: {
          from: "office",
          localField: "office",
          foreignField: "_id",
          as: "branch",
        },
      },
      {
        $unwind: {
          path: "$branch",
          preserveNullAndEmptyArrays: true,
        },
      },

      // ==========================================
      // TOTAL LEAVE SUMMARY (ALL MONTHS)
      // ==========================================
      {
        $lookup: {
          from: "leavebalances",
          let: { employeeId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$employeeId", "$$employeeId"],
                },
              },
            },
            {
              $lookup: {
                from: "leavetypes",
                localField: "leaveTypeId",
                foreignField: "_id",
                as: "leaveType",
              },
            },
            {
              $unwind: "$leaveType",
            },
            {
              $group: {
                _id: "$leaveType.code",

                totalAllocated: {
                  $sum: { $ifNull: ["$allocated", 0] },
                },

                totalUsed: {
                  $sum: { $ifNull: ["$used", 0] },
                },

                totalRemaining: {
                  $sum: {
                    $subtract: [
                      { $ifNull: ["$allocated", 0] },
                      { $ifNull: ["$used", 0] }
                    ]
                  },
                },

                totalLop: {
                  $sum: { $ifNull: ["$lop", 0] },
                },
              },
            },
          ],
          as: "leaveSummary",
        },
      },

      // ==========================================
      // CURRENT MONTH LEAVE SUMMARY
      // ==========================================
      {
        $lookup: {
          from: "leavebalances",
          let: { employeeId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$employeeId", "$$employeeId"] },
                    { $eq: ["$month", currentMonth] },
                    { $eq: ["$year", currentYear] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: "leavetypes",
                localField: "leaveTypeId",
                foreignField: "_id",
                as: "leaveType",
              },
            },
            {
              $unwind: "$leaveType",
            },
            {
              $group: {
                _id: "$leaveType.code",

                allocated: {
                  $sum: { $ifNull: ["$allocated", 0] },
                },

                used: {
                  $sum: { $ifNull: ["$used", 0] },
                },

                remaining: {
                  $sum: {
                    $subtract: [
                      { $ifNull: ["$allocated", 0] },
                      { $ifNull: ["$used", 0] }
                    ]
                  },
                },

                lop: {
                  $sum: { $ifNull: ["$lop", 0] },
                },
              },
            },
          ],
          as: "currentMonthLeave",
        },
      },

      // ==========================================
      // PREVIOUS MONTHS LEAVE SUMMARY (EXCLUDING CURRENT MONTH)
      // ==========================================
      {
        $lookup: {
          from: "leavebalances",
          let: { employeeId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$employeeId", "$$employeeId"] },
                    { $lt: ["$month", currentMonth] },
                    { $eq: ["$year", currentYear] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: "leavetypes",
                localField: "leaveTypeId",
                foreignField: "_id",
                as: "leaveType",
              },
            },
            {
              $unwind: "$leaveType",
            },
            // Sort by month descending to get the latest month first
            {
              $sort: { month: -1 }
            },
            // Group by leave type and get the latest month's data
            {
              $group: {
                _id: "$leaveType.code",
                // Get the latest month's allocated, used, remaining, lop
                totalAllocated: { $first: "$allocated" },
                totalUsed: { $first: "$used" },
                totalRemaining: { $first: "$remaining" },
                totalLop: { $first: "$lop" },
                // Optionally keep track of the latest month
                latestMonth: { $first: "$month" }
              },
            },
          ],
          as: "previousMonthsLeave",
        },
      },

      // ==========================================
      // MAP EL & SL FOR ALL CATEGORIES
      // ==========================================
      {
        $addFields: {
          earnedLeave: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$leaveSummary",
                  as: "item",
                  cond: { $eq: ["$$item._id", "EL"] },
                },
              },
              0,
            ],
          },

          shortLeave: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$leaveSummary",
                  as: "item",
                  cond: { $eq: ["$$item._id", "SL"] },
                },
              },
              0,
            ],
          },

          currentMonthEL: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$currentMonthLeave",
                  as: "item",
                  cond: { $eq: ["$$item._id", "EL"] },
                },
              },
              0,
            ],
          },

          currentMonthSL: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$currentMonthLeave",
                  as: "item",
                  cond: { $eq: ["$$item._id", "SL"] },
                },
              },
              0,
            ],
          },

          previousMonthsEL: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$previousMonthsLeave",
                  as: "item",
                  cond: { $eq: ["$$item._id", "EL"] },
                },
              },
              0,
            ],
          },

          previousMonthsSL: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$previousMonthsLeave",
                  as: "item",
                  cond: { $eq: ["$$item._id", "SL"] },
                },
              },
              0,
            ],
          },
        },
      },

      // ==========================================
      // FINAL RESPONSE
      // ==========================================
      {
        $project: {
          _id: 1,
          fullName: 1,
          email: 1,
          employeeCode: 1,

          department: "$department.name",
          designation: "$designation.title",
          branch: "$branch.name",

          reportingTo: {
            _id: "$reportingManager._id",
            name: "$reportingManager.fullName",
            email: "$reportingManager.email",
          },

          // ==========================================
          // EARNED LEAVE (EL) - ALL TIME
          // ==========================================
          totalLeave: {
            $ifNull: ["$earnedLeave.totalAllocated", 0],
          },

          totalLeaveUsed: {
            $ifNull: ["$earnedLeave.totalUsed", 0],
          },

          totalLeaveRemaining: {
            $ifNull: ["$earnedLeave.totalRemaining", 0],
          },

          totalLeaveLop: {
            $ifNull: ["$earnedLeave.totalLop", 0],
          },

          // ==========================================
          // SHORT LEAVE (SL) - ALL TIME
          // ==========================================
          totalShortLeave: {
            $ifNull: ["$shortLeave.totalAllocated", 0],
          },

          totalShortLeaveUsed: {
            $ifNull: ["$shortLeave.totalUsed", 0],
          },

          totalShortLeaveRemaining: {
            $ifNull: ["$shortLeave.totalRemaining", 0],
          },

          totalShortLeaveLop: {
            $ifNull: ["$shortLeave.totalLop", 0],
          },

          // ==========================================
          // CURRENT MONTH EL
          // ==========================================
          currentMonthLeaveTotal: {
            $ifNull: ["$currentMonthEL.allocated", 0],
          },

          currentMonthLeaveUsed: {
            $ifNull: ["$currentMonthEL.used", 0],
          },

          currentMonthLeaveRemaining: {
            $ifNull: ["$currentMonthEL.remaining", 0],
          },

          currentMonthLeaveLop: {
            $ifNull: ["$currentMonthEL.lop", 0],
          },

          // ==========================================
          // CURRENT MONTH SL
          // ==========================================
          currentMonthShortLeaveTotal: {
            $ifNull: ["$currentMonthSL.allocated", 0],
          },

          currentMonthShortLeaveUsed: {
            $ifNull: ["$currentMonthSL.used", 0],
          },

          currentMonthShortLeaveRemaining: {
            $ifNull: ["$currentMonthSL.remaining", 0],
          },

          currentMonthShortLeaveLop: {
            $ifNull: ["$currentMonthSL.lop", 0],
          },

          // ==========================================
          // PREVIOUS MONTHS EL (EXCLUDING CURRENT MONTH)
          // ==========================================
          previousMonthsLeaveTotal: {
            $ifNull: ["$previousMonthsEL.totalAllocated", 0],
          },

          previousMonthsLeaveUsed: {
            $ifNull: ["$previousMonthsEL.totalUsed", 0],
          },

          previousMonthsLeaveRemaining: {
            $ifNull: ["$previousMonthsEL.totalRemaining", 0],
          },

          previousMonthsLeaveLop: {
            $ifNull: ["$previousMonthsEL.totalLop", 0],
          },

          // ==========================================
          // PREVIOUS MONTHS SL (EXCLUDING CURRENT MONTH)
          // ==========================================
          previousMonthsShortLeaveTotal: {
            $ifNull: ["$previousMonthsSL.totalAllocated", 0],
          },

          previousMonthsShortLeaveUsed: {
            $ifNull: ["$previousMonthsSL.totalUsed", 0],
          },

          previousMonthsShortLeaveRemaining: {
            $ifNull: ["$previousMonthsSL.totalRemaining", 0],
          },

          previousMonthsShortLeaveLop: {
            $ifNull: ["$previousMonthsSL.totalLop", 0],
          },
        },
      },
    ]);
  } catch (error) {
    throw new ApiError(
      httpStatus.status.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

// const getEmployeeProfile = async (filterQuery) => {
//   try {
//     const currentMonth = new Date().getMonth() + 1;
//     const currentYear = new Date().getFullYear();

//     return await Employee.aggregate([
//       {
//         $match: filterQuery,
//       },

//       {
//         $lookup: {
//           from: "departments",
//           localField: "department",
//           foreignField: "_id",
//           as: "department",
//         },
//       },
//       {
//         $unwind: {
//           path: "$department",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "designations",
//           localField: "designation",
//           foreignField: "_id",
//           as: "designation",
//         },
//       },
//       {
//         $unwind: {
//           path: "$designation",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "employees",
//           localField: "reportingTo",
//           foreignField: "_id",
//           as: "reportingManager",
//         },
//       },
//       {
//         $unwind: {
//           path: "$reportingManager",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       {
//         $lookup: {
//           from: "office",
//           localField: "office",
//           foreignField: "_id",
//           as: "branch",
//         },
//       },
//       {
//         $unwind: {
//           path: "$branch",
//           preserveNullAndEmptyArrays: true,
//         },
//       },

//       // ==========================================
//       // TOTAL LEAVE SUMMARY (ALL MONTHS)
//       // ==========================================
//       {
//         $lookup: {
//           from: "leavebalances",
//           let: { employeeId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: ["$employeeId", "$$employeeId"],
//                 },
//               },
//             },
//             {
//               $lookup: {
//                 from: "leavetypes",
//                 localField: "leaveTypeId",
//                 foreignField: "_id",
//                 as: "leaveType",
//               },
//             },
//             {
//               $unwind: "$leaveType",
//             },
//             {
//               $group: {
//                 _id: "$leaveType.code",

//                 totalAllocated: {
//                   $sum: { $ifNull: ["$allocated", 0] },
//                 },

//                 totalUsed: {
//                   $sum: { $ifNull: ["$used", 0] },
//                 },

//                 // Calculate remaining as allocated - used instead of using stored remaining
//                 totalRemaining: {
//                   $sum: {
//                     $subtract: [
//                       { $ifNull: ["$allocated", 0] },
//                       { $ifNull: ["$used", 0] }
//                     ]
//                   },
//                 },

//                 totalLop: {
//                   $sum: { $ifNull: ["$lop", 0] },
//                 },
//               },
//             },
//           ],
//           as: "leaveSummary",
//         },
//       },

//       // ==========================================
//       // CURRENT MONTH LEAVE SUMMARY
//       // ==========================================
//       {
//         $lookup: {
//           from: "leavebalances",
//           let: { employeeId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $and: [
//                     { $eq: ["$employeeId", "$$employeeId"] },
//                     { $eq: ["$month", currentMonth] },
//                     { $eq: ["$year", currentYear] },
//                   ],
//                 },
//               },
//             },
//             {
//               $lookup: {
//                 from: "leavetypes",
//                 localField: "leaveTypeId",
//                 foreignField: "_id",
//                 as: "leaveType",
//               },
//             },
//             {
//               $unwind: "$leaveType",
//             },
//             {
//               $group: {
//                 _id: "$leaveType.code",

//                 allocated: {
//                   $sum: { $ifNull: ["$allocated", 0] },
//                 },

//                 used: {
//                   $sum: { $ifNull: ["$used", 0] },
//                 },

//                 // Calculate remaining as allocated - used instead of using stored remaining
//                 remaining: {
//                   $sum: {
//                     $subtract: [
//                       { $ifNull: ["$allocated", 0] },
//                       { $ifNull: ["$used", 0] }
//                     ]
//                   },
//                 },

//                 lop: {
//                   $sum: { $ifNull: ["$lop", 0] },
//                 },
//               },
//             },
//           ],
//           as: "currentMonthLeave",
//         },
//       },

//       // ==========================================
//       // MAP EL & SL
//       // ==========================================
//       {
//         $addFields: {
//           earnedLeave: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$leaveSummary",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "EL"] },
//                 },
//               },
//               0,
//             ],
//           },

//           shortLeave: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$leaveSummary",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "SL"] },
//                 },
//               },
//               0,
//             ],
//           },

//           currentMonthEL: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$currentMonthLeave",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "EL"] },
//                 },
//               },
//               0,
//             ],
//           },

//           currentMonthSL: {
//             $arrayElemAt: [
//               {
//                 $filter: {
//                   input: "$currentMonthLeave",
//                   as: "item",
//                   cond: { $eq: ["$$item._id", "SL"] },
//                 },
//               },
//               0,
//             ],
//           },
//         },
//       },

//       // ==========================================
//       // FINAL RESPONSE
//       // ==========================================
//       {
//         $project: {
//           _id: 1,
//           fullName: 1,
//           email: 1,
//           employeeCode: 1,

//           department: "$department.name",
//           designation: "$designation.title",
//           branch: "$branch.name",

//           reportingTo: {
//             _id: "$reportingManager._id",
//             name: "$reportingManager.fullName",
//             email: "$reportingManager.email",
//           },

//           // ==========================================
//           // EARNED LEAVE (EL)
//           // ==========================================
//           totalLeave: {
//             $ifNull: ["$earnedLeave.totalAllocated", 0],
//           },

//           totalLeaveUsed: {
//             $ifNull: ["$earnedLeave.totalUsed", 0],
//           },

//           totalLeaveRemaining: {
//             $ifNull: ["$earnedLeave.totalRemaining", 0],
//           },

//           totalLeaveLop: {
//             $ifNull: ["$earnedLeave.totalLop", 0],
//           },

//           // ==========================================
//           // SHORT LEAVE (SL)
//           // ==========================================
//           totalShortLeave: {
//             $ifNull: ["$shortLeave.totalAllocated", 0],
//           },

//           totalShortLeaveUsed: {
//             $ifNull: ["$shortLeave.totalUsed", 0],
//           },

//           totalShortLeaveRemaining: {
//             $ifNull: ["$shortLeave.totalRemaining", 0],
//           },

//           totalShortLeaveLop: {
//             $ifNull: ["$shortLeave.totalLop", 0],
//           },

//           // ==========================================
//           // CURRENT MONTH EL
//           // ==========================================
//           currentMonthLeaveTotal: {
//             $ifNull: ["$currentMonthEL.allocated", 0],
//           },

//           currentMonthLeaveUsed: {
//             $ifNull: ["$currentMonthEL.used", 0],
//           },

//           currentMonthLeaveRemaining: {
//             $ifNull: ["$currentMonthEL.remaining", 0],
//           },

//           currentMonthLeaveLop: {
//             $ifNull: ["$currentMonthEL.lop", 0],
//           },

//           // ==========================================
//           // CURRENT MONTH SL
//           // ==========================================
//           currentMonthShortLeaveTotal: {
//             $ifNull: ["$currentMonthSL.allocated", 0],
//           },

//           currentMonthShortLeaveUsed: {
//             $ifNull: ["$currentMonthSL.used", 0],
//           },

//           currentMonthShortLeaveRemaining: {
//             $ifNull: ["$currentMonthSL.remaining", 0],
//           },

//           currentMonthShortLeaveLop: {
//             $ifNull: ["$currentMonthSL.lop", 0],
//           },
//         },
//       },
//     ]);
//   } catch (error) {
//     throw new ApiError(
//       httpStatus.status.INTERNAL_SERVER_ERROR,
//       error.message
//     );
//   }
// };
const updateEmployeeStatus = async (employeeId, status) => {
  try {
    const employee = await Employee.findById(employeeId);

    if (!employee) {
      throw new ApiError(httpStatus.status.NOT_FOUND, "Employee not found");
    }

    employee.isActive = status;
    await employee.save();

    return employee;
  } catch (error) {
    throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message);
  }
};
module.exports = {
  createEmployee,
  getEmployeeByEmail,
  getEmployeeById,
  getEmployeeByDeviceName,
  updateAuthStep,
  updateEmployee,
  updateLastLogin,
  saveRefreshToken,
  clearRefreshToken,
  updateEmployeeProfile,
  validateRefreshToken,
  getEmployees,
  getEmployeeProfile,
  getEmployeeByCode,
  updateEmployeeStatus
};