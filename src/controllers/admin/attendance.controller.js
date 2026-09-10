const { ObjectId } = require('mongodb');
const Employee = require('../../models/employee.model');
const { attendanceService, employeeService } = require('../../services/index');

// const getAttendance = async (req, res) => {
//   const { employeeId, date, fromDate, toDate, page = 1, limit = 10 } = req.query || {};
//   const matchQuery = {};
//   const employeeMatchQuery = {
//     isActive: true
//   };

//   if (req.user.role === 'CEO') {
//     employeeMatchQuery._id = {
//       $ne: new ObjectId(req.user.employeeId)
//     };
//   }

//   if (req.user.role == 'MANAGER') {
//     employeeMatchQuery["reportingTo"] = new ObjectId(req.user.employeeId)
//   }

//   // const employees = await employeeService.getEmployees(employeeMatchQuery);

//   const employees = await Employee.find(
//     employeeMatchQuery,
//     { _id: 1 }
//   ).lean();

//   const employeeIds = employees.map(emp => emp._id.toString());

//   if (employeeIds.length > 0) {
//     matchQuery.employee = { $in: employeeIds.map(id => new ObjectId(id)) }
//   } else {
//     return res.status(200).json({
//       success: true,
//       message: "Attendance retrieved successfully",
//       data: [],
//       pagination: {
//         page: parseInt(page),
//         limit: parseInt(limit),
//         total: 0,
//         pages: 0,
//         hasNext: false,
//         hasPrev: false
//       }
//     });
//   }

//   /* ================================
//      📅 DATE FILTER (USE `date` FIELD)
//      ================================ */
//   if (date) {
//     const start = new Date(date);
//     start.setHours(0, 0, 0, 0);
//     const end = new Date(date);
//     end.setHours(23, 59, 59, 999);
//     matchQuery.date = { $gte: start, $lte: end };
//   } else if (fromDate && toDate) {
//     const start = new Date(fromDate);
//     start.setHours(0, 0, 0, 0);
//     const end = new Date(toDate);
//     end.setHours(23, 59, 59, 999);
//     matchQuery.date = { $gte: start, $lte: end };
//   } else {
//     const start = new Date();
//     start.setHours(0, 0, 0, 0);
//     const end = new Date();
//     end.setHours(23, 59, 59, 999);
//     matchQuery.date = { $gte: start, $lte: end };
//   }

//   /* ================================
//      👤 EMPLOYEE FILTER
//      ================================ */
//   if (employeeId) {
//     matchQuery.employee = new ObjectId(employeeId);
//   }

//   // Pass page and limit for pagination
//   const attendanceData = await attendanceService.getAttendanceForAdmin(
//     matchQuery,
//     employeeMatchQuery,
//     parseInt(page),
//     parseInt(limit)
//   );

//   return res.status(200).json({
//     success: true,
//     message: "Attendance retrieved successfully",
//     data: attendanceData.data,
//     pagination: attendanceData.pagination,
//   });
// };


// // Helper function to validate date format
// const isValidDate = (dateString) => {
//   if (!dateString) return true;
//   const regex = /^\d{4}-\d{2}-\d{2}$/;
//   if (!regex.test(dateString)) return false;
//   const date = new Date(dateString);
//   return date instanceof Date && !isNaN(date);
// };

// const getAttendanceReport = async (req, res) => {
//   try {
//     const { startDate, endDate } = req.query;

//     // Validate date formats
//     if (startDate && !isValidDate(startDate)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid startDate format. Use YYYY-MM-DD"
//       });
//     }

//     if (endDate && !isValidDate(endDate)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid endDate format. Use YYYY-MM-DD"
//       });
//     }

//     // Build employee filter query based on user role
//     const employeeMatchQuery = {
//       isActive: true
//     };

//     if (req.user.role === 'CEO') {
//       employeeMatchQuery._id = {
//         $ne: new ObjectId(req.user.employeeId)
//       };
//     }

//     if (req.user.role === 'MANAGER') {
//       employeeMatchQuery["reportingTo"] = new ObjectId(req.user.employeeId);
//     }

//     // Generate report with enhanced date range
//     const report = await attendanceService.generateAttendanceReport(
//       employeeMatchQuery,
//       {
//         startDate: startDate || null,
//         endDate: endDate || null
//       }
//     );

//     return res.status(200).json({
//       success: true,
//       message: "Attendance report fetched successfully",
//       data: report
//     });
//   } catch (error) {
//     console.error('Error in getAttendanceReport:', error);

//     // Handle specific error types
//     if (error.message.includes("cannot be greater than") ||
//       error.message.includes("exceed") ||
//       error.message.includes("future dates")) {
//       return res.status(400).json({
//         success: false,
//         message: error.message
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message: "Failed to generate attendance report"
//     });
//   }
// };

const getAttendance = async (req, res) => {
  const { employeeId, date, fromDate, toDate, page = 1, limit = 10 } = req.query || {};

  const matchQuery = {};
  const employeeMatchQuery = { isActive: true };

  if (req.user.role === 'CEO') {
    employeeMatchQuery._id = { $ne: new ObjectId(req.user.employeeId) };
  }

  if (req.user.role === 'MANAGER') {
    employeeMatchQuery.reportingTo = new ObjectId(req.user.employeeId);
  }

  // NOTE: the pre-fetch of employees that used to live here is gone.
  // The service now fetches employees itself (once) and scopes the
  // attendance query from that same result, so this controller no longer
  // needs to touch the Employee collection at all.

  /* ================================
     📅 DATE FILTER (USE `date` FIELD)
     ================================ */
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    matchQuery.date = { $gte: start, $lte: end };
  } else if (fromDate && toDate) {
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    matchQuery.date = { $gte: start, $lte: end };
  } else {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    matchQuery.date = { $gte: start, $lte: end };
  }

  /* ================================
     👤 EMPLOYEE FILTER
     ================================ */
  if (employeeId) {
    // Filter at the employee-roster level instead of only on Attendance —
    // this way a single employee with zero attendance for the day still
    // correctly comes back as one ABSENT row instead of an empty result.
    employeeMatchQuery._id = new ObjectId(employeeId);
  }

  const attendanceData = await attendanceService.getAttendanceForAdmin(
    matchQuery,
    employeeMatchQuery,
    parseInt(page, 10),
    parseInt(limit, 10)
  );

  return res.status(200).json({
    success: true,
    message: 'Attendance retrieved successfully',
    data: attendanceData.data,
    pagination: {
      ...attendanceData.pagination,
      hasNext: attendanceData.pagination.page < attendanceData.pagination.pages,
      hasPrev: attendanceData.pagination.page > 1,
    },
  });
};


const isValidDate = (dateString) => {
  if (!dateString) return true;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

const getAttendanceReport = async (req, res) => {
  const requestStart = process.hrtime.bigint();

  try {
    const { startDate, endDate, page = 1, limit = 100 } = req.query;

    // Validate date formats
    if (startDate && !isValidDate(startDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid startDate format. Use YYYY-MM-DD"
      });
    }

    if (endDate && !isValidDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid endDate format. Use YYYY-MM-DD"
      });
    }

    // Validate pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: "Page must be a positive integer"
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 500) {
      return res.status(400).json({
        success: false,
        message: "Limit must be between 1 and 500"
      });
    }

    // Build employee match query based on role
    const employeeMatchQuery = { isActive: true };

    if (req.user.role === 'CEO') {
      // CEO sees all employees except themselves
      employeeMatchQuery._id = { $ne: new ObjectId(req.user.employeeId) };
    } else if (req.user.role === 'MANAGER') {
      // Manager sees only their direct reports
      employeeMatchQuery["reportingTo"] = new ObjectId(req.user.employeeId);
    }
    // For other roles (like EMPLOYEE), they would only see themselves
    // but this is handled by the service layer

    // Log the query for debugging
    console.log(`[getAttendanceReport] Query:`, JSON.stringify(employeeMatchQuery));
    console.log(`[getAttendanceReport] Date range: ${startDate || 'default'} to ${endDate || 'default'}`);

    // Generate the report
    const report = await attendanceService.generateAttendanceReport(
      employeeMatchQuery,
      { startDate: startDate || null, endDate: endDate || null }
    );

    // Apply pagination to the report data
    const paginatedReport = {
      ...report,
      report: report.report.slice((pageNum - 1) * limitNum, pageNum * limitNum),
      pagination: {
        currentPage: pageNum,
        pageSize: limitNum,
        totalRecords: report.report.length,
        totalPages: Math.ceil(report.report.length / limitNum)
      }
    };

    const totalMs = Number(process.hrtime.bigint() - requestStart) / 1e6;
    console.log(`[getAttendanceReport] TOTAL controller time: ${totalMs.toFixed(1)}ms`);
    console.log(`[getAttendanceReport] Returning ${paginatedReport.report.length} of ${report.report.length} employees`);

    return res.status(200).json({
      success: true,
      message: "Attendance report fetched successfully",
      data: paginatedReport
    });
  } catch (error) {
    const totalMs = Number(process.hrtime.bigint() - requestStart) / 1e6;
    console.error(`[getAttendanceReport] FAILED after ${totalMs.toFixed(1)}ms:`, error);

    // Handle specific error types
    if (error.message.includes("cannot be greater than") ||
        error.message.includes("exceed") ||
        error.message.includes("future dates")) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Handle MongoDB connection errors
    if (error.name === 'MongoTimeoutError' || error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        message: "Database query timed out. Please try with a smaller date range."
      });
    }

    // Handle memory issues
    if (error.message.includes('memory') || error.message.includes('exceeded')) {
      return res.status(413).json({
        success: false,
        message: "Request is too large. Please reduce the date range or use pagination."
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to generate attendance report",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// const getAttendanceReport = async (req, res) => {
//   const requestStart = process.hrtime.bigint();

//   try {
//     const { startDate, endDate } = req.query;

//     if (startDate && !isValidDate(startDate)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid startDate format. Use YYYY-MM-DD"
//       });
//     }

//     if (endDate && !isValidDate(endDate)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid endDate format. Use YYYY-MM-DD"
//       });
//     }

//     const employeeMatchQuery = { isActive: true };

//     if (req.user.role === 'CEO') {
//       employeeMatchQuery._id = { $ne: new ObjectId(req.user.employeeId) };
//     }

//     if (req.user.role === 'MANAGER') {
//       employeeMatchQuery["reportingTo"] = new ObjectId(req.user.employeeId);
//     }

//     const report = await attendanceService.generateAttendanceReport(
//       employeeMatchQuery,
//       { startDate: startDate || null, endDate: endDate || null }
//     );

//     const totalMs = Number(process.hrtime.bigint() - requestStart) / 1e6;
//     console.log(`[getAttendanceReport] TOTAL controller time: ${totalMs.toFixed(1)}ms`);

//     return res.status(200).json({
//       success: true,
//       message: "Attendance report fetched successfully",
//       data: report
//     });
//   } catch (error) {
//     const totalMs = Number(process.hrtime.bigint() - requestStart) / 1e6;
//     console.error(`[getAttendanceReport] FAILED after ${totalMs.toFixed(1)}ms:`, error);

//     if (error.message.includes("cannot be greater than") ||
//       error.message.includes("exceed") ||
//       error.message.includes("future dates")) {
//       return res.status(400).json({
//         success: false,
//         message: error.message
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message: "Failed to generate attendance report"
//     });
//   }
// };




// Get report summary (lighter version without full attendance details)
const getAttendanceSummary = async (req, res) => {
  const requestStart = process.hrtime.bigint();

  try {
    const { startDate, endDate } = req.query;

    if (startDate && !isValidDate(startDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid startDate format. Use YYYY-MM-DD"
      });
    }

    if (endDate && !isValidDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid endDate format. Use YYYY-MM-DD"
      });
    }

    const employeeMatchQuery = { isActive: true };

    if (req.user.role === 'CEO') {
      employeeMatchQuery._id = { $ne: new ObjectId(req.user.employeeId) };
    }

    if (req.user.role === 'MANAGER') {
      employeeMatchQuery.reportingTo = new ObjectId(req.user.employeeId);
    }

    // Get full report but without detailed attendance records
    const fullReport = await attendanceService.generateAttendanceReport(
      employeeMatchQuery,
      { startDate: startDate || null, endDate: endDate || null }
    );

    // Extract only summary data
    const summaryData = fullReport.report.map(emp => ({
      employeeId: emp.employeeId,
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      department: emp.department,
      designation: emp.designation,
      summary: emp.summary
    }));

    const totalMs = Number(process.hrtime.bigint() - requestStart) / 1e6;
    console.log(`[getAttendanceSummary] Completed in ${totalMs.toFixed(1)}ms`);

    return res.status(200).json({
      success: true,
      message: "Attendance summary fetched successfully",
      data: {
        fromDate: fullReport.fromDate,
        toDate: fullReport.toDate,
        totalEmployees: fullReport.totalEmployees,
        totalDays: fullReport.totalDays,
        employees: summaryData
      }
    });

  } catch (error) {
    console.error('[getAttendanceSummary] Error:', error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate attendance summary"
    });
  }
};
// ============================================================================
// REQUEST REGULARIZATION - Controller
// ============================================================================
const requestRegularization = async (req, res) => {
  try {
    const {
      attendanceId,
      requestType,
      attendanceDate,
      requestedPunchIn,
      requestedPunchOut,
      reason
    } = req.body;

    // Validate required fields
    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        message: "Attendance ID is required"
      });
    }

    if (!requestType) {
      return res.status(400).json({
        success: false,
        message: "Request type is required"
      });
    }

    if (!attendanceDate) {
      return res.status(400).json({
        success: false,
        message: "Attendance date is required"
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Reason is required"
      });
    }

    // Check if user has permission
    // You can add role-based permissions here

    const result = await attendanceService.requestRegularization({
      attendanceId,
      employeeId: req.user?._id, // From auth middleware
      requestType,
      attendanceDate: new Date(attendanceDate),
      requestedPunchIn: requestedPunchIn ? new Date(requestedPunchIn) : null,
      requestedPunchOut: requestedPunchOut ? new Date(requestedPunchOut) : null,
      reason,
      requestedBy: req.user?._id
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      message: "Regularization request submitted successfully",
      data: result.data
    });

  } catch (error) {
    console.error("Error in requestRegularization:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============================================================================
// GET REGULARIZATION REQUESTS - Controller
// ============================================================================
const getRegularizationRequests = async (req, res) => {
  try {
    const {
      status,
      employeeId,
      requestType,
      startDate,
      endDate,
      page = 1,
      limit = 10
    } = req.query;

    // If employee is not admin/HR, only show their own requests
    const queryEmployeeId = req.user?.role === 'ADMIN' || req.user?.role === 'HR'
      ? employeeId
      : req.user?._id;

    const result = await attendanceService.getRegularizationRequests({
      user: req.user,
      status,
      employeeId: queryEmployeeId,
      requestType,
      startDate,
      endDate,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error("Error in getRegularizationRequests:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============================================================================
// GET REGULARIZATION BY ID - Controller
// ============================================================================
const getRegularizationById = async (req, res) => {
  try {
    const { regularizationId } = req.params;

    if (!regularizationId) {
      return res.status(400).json({
        success: false,
        message: "Regularization ID is required"
      });
    }

    const result = await attendanceService.getRegularizationById(
      regularizationId,
      req.user?._id,
      req.user?.role
    );

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error("Error in getRegularizationById:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============================================================================
// APPROVE REGULARIZATION - Controller
// ============================================================================
const approveRegularization = async (req, res) => {
  try {
    const { regularizationId } = req.params;
    const {
      approvalRemark,
      approvedPunchIn,
      approvedPunchOut
    } = req.body;

    if (!regularizationId) {
      return res.status(400).json({
        success: false,
        message: "Regularization ID is required"
      });
    }

    // Check if user has permission to approve
    // Only ADMIN, HR, or MANAGER can approve

    const result = await attendanceService.approveRegularization({
      regularizationId,
      approvedBy: req.user?._id,
      approvalRemark: approvalRemark || "Approved by admin",
      approvedPunchIn: approvedPunchIn ? new Date(approvedPunchIn) : null,
      approvedPunchOut: approvedPunchOut ? new Date(approvedPunchOut) : null
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      message: "Regularization request approved successfully",
      data: result.data
    });

  } catch (error) {
    console.error("Error in approveRegularization:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============================================================================
// REJECT REGULARIZATION - Controller
// ============================================================================
const rejectRegularization = async (req, res) => {
  try {
    const { regularizationId } = req.params;
    const { rejectionRemark } = req.body;

    if (!regularizationId) {
      return res.status(400).json({
        success: false,
        message: "Regularization ID is required"
      });
    }

    if (!rejectionRemark) {
      return res.status(400).json({
        success: false,
        message: "Rejection remark is required"
      });
    }

    // Check if user has permission to reject

    const result = await attendanceService.rejectRegularization({
      regularizationId,
      rejectedBy: req.user?._id,
      rejectionRemark
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      message: "Regularization request rejected successfully",
      data: result.data
    });

  } catch (error) {
    console.error("Error in rejectRegularization:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============================================================================
// CANCEL REGULARIZATION REQUEST - Controller
// ============================================================================
const cancelRegularization = async (req, res) => {
  try {
    const { regularizationId } = req.params;

    if (!regularizationId) {
      return res.status(400).json({
        success: false,
        message: "Regularization ID is required"
      });
    }

    const result = await attendanceService.cancelRegularization({
      regularizationId,
      cancelledBy: req.user?._id
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      message: "Regularization request cancelled successfully",
      data: result.data
    });

  } catch (error) {
    console.error("Error in cancelRegularization:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============================================================================
// GET EMPLOYEE REGULARIZATION SUMMARY - Controller
// ============================================================================
const getEmployeeRegularizationSummary = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year, month } = req.query;

    const result = await attendanceService.getEmployeeRegularizationSummary({
      employeeId: employeeId || req.user?._id,
      year: parseInt(year) || new Date().getFullYear(),
      month: parseInt(month) || new Date().getMonth() + 1
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error("Error in getEmployeeRegularizationSummary:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};




module.exports = {
  getAttendance,
  getAttendanceReport,
  requestRegularization,
  getRegularizationRequests,
  getRegularizationById,
  approveRegularization,
  rejectRegularization,
  cancelRegularization,
  getEmployeeRegularizationSummary,
}