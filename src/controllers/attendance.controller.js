const { ObjectId } = require('mongodb');
const httpStatus = require("http-status");
const catchAsync = require("../utils/catchAsync");
const ApiError = require("../utils/ApiError");
const { attendanceService } = require("../services");

const punchIn = catchAsync(async (req, res) => {


  const result = await attendanceService.punchIn({
    employeeId: req.user.employeeId,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    address: req.body.address,
    imageBase64: req.fileUrls?.image,
  });

  return res.status(httpStatus.status.OK).json({
    success: true,
    status: httpStatus.status.OK,
    message: "Punch in successful",
    data: result,
  });
});

const punchOut = catchAsync(async (req, res) => {
  const result = await attendanceService.punchOut({
    employeeId: req.user.employeeId,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    address: req.body.address,
    imageBase64: req.fileUrls?.image,
  });

  return res.status(httpStatus.status.OK).json({
    success: true,
    status: httpStatus.status.OK,
    message: "Punch out successful",
    data: result,
  });
});

// const getAttendanceHistory = async (req, res) => {
//   const { date, fromDate, toDate } = req.query || {};
//   const matchQuery = {};
//   const { employeeId } = req.user;

//   /* ================================
//      📅 DATE FILTER
//   ================================ */

//   let start, end;

//   if (date) {
//     start = new Date(date);
//     start.setHours(0, 0, 0, 0);

//     end = new Date(date);
//     end.setHours(23, 59, 59, 999);

//     matchQuery.date = { $gte: start, $lte: end };
//   } else if (fromDate && toDate) {
//     start = new Date(fromDate);
//     start.setHours(0, 0, 0, 0);

//     end = new Date(toDate);
//     end.setHours(23, 59, 59, 999);

//     matchQuery.date = { $gte: start, $lte: end };
//   }

//   /* ================================
//      👤 EMPLOYEE FILTER
//   ================================ */
//   matchQuery.employee = new ObjectId(employeeId);

//   const attendanceData = await attendanceService.getAttendanceForEmployee(
//     matchQuery,
//     start,
//     end
//   );

//   /* ================================
//      ✅ MATCH PREVIOUS RESPONSE FORMAT
//      (Add isPunchedIn)
//   ================================ */
//   attendanceData.data = attendanceData.data.map((item) => ({
//     ...item,
//     isPunchedIn: item.status === "PRESENT",
//     // isPunchedIn: !!item.firstPunchIn && !item.lastPunchOut,
//   }));

//   return res.status(200).json({
//     success: true,
//     message: "Attendance history fetched successfully", // ✅ same message
//     ...attendanceData,
//   });
// };
/* =========================================================
   GET ATTENDANCE HISTORY CONTROLLER
========================================================= */
const getAttendanceHistory = async (req, res) => {
  try {
    // const { date, fromDate, toDate } = req.query || {};
    // const { employeeId } = req.user;

    // const matchQuery = {};
    // let start, end;

    // /* ================================
    //    📅 DATE FILTER
    // ================================ */

    // if (date) {
    //   start = new Date(date);
    //   start.setHours(0, 0, 0, 0);

    //   end = new Date(date);
    //   end.setHours(23, 59, 59, 999);
    // } else if (fromDate && toDate) {
    //   start = new Date(fromDate);
    //   start.setHours(0, 0, 0, 0);

    //   end = new Date(toDate);
    //   end.setHours(23, 59, 59, 999);
    // }


    const { date, fromDate, toDate } = req.query || {};
    const { employeeId } = req.user;

    const matchQuery = {};
    let start, end;

    /* ================================
       📅 DATE FILTER
    ================================ */

    const getStartOfDay = (dateString) => {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    };

    const getEndOfDay = (dateString) => {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day, 23, 59, 59, 999);
    };

    if (date) {
      start = getStartOfDay(date);
      end = getEndOfDay(date);
    } else if (fromDate && toDate) {
      start = getStartOfDay(fromDate);
      end = getEndOfDay(toDate);
    }

    /* ================================
       👤 EMPLOYEE FILTER
    ================================ */
    matchQuery.employee = new ObjectId(employeeId);

    const attendanceData =
      await attendanceService.getAttendanceForEmployee(
        matchQuery,
        start,
        end
      );

    // /* ================================
    //    ✅ ADD isPunchedIn
    // ================================ */
    // attendanceData.data = attendanceData.data.map((item) => ({
    //   ...item,
    //   isPunchedIn:
    //     item.status == "PRESENT" ? true : false,

    // }));

    /* ================================
   ✅ ADD isPunchedIn & isVisitActive
================================ */
    attendanceData.data = attendanceData.data.map((item) => {
      const lastSession = item.sessions?.[item.sessions.length - 1];

      // console.log("last session", lastSession);
      const lastVisit = lastSession?.visits?.[lastSession.visits.length - 1];

      // console.log("last visit", lastVisit);

      // console.log("isVisitActive", lastVisit != null && lastVisit.visitOut == null);

      return {
        ...item,
        isPunchedIn: item.status === "PRESENT",
        isVisitActive: lastVisit != null && lastVisit.visitOut == null,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Attendance history fetched successfully",
      ...attendanceData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};
const getAttendanceSummary = catchAsync(async (req, res) => {
  const { employeeId } = req.user;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Start date and end date are required");
  }

  const result = await attendanceService.getAttendanceSummary(employeeId, startDate, endDate);

  return res.status(httpStatus.status.OK).json({
    success: true,
    message: "Attendance summary fetched successfully",
    data: result,
  });
});

const breakIn = catchAsync(async (req, res) => {
  const result = await attendanceService.breakIn({
    employeeId: req.user.employeeId,
    breakType: req.body.breakType,
    remarks: req.body.remarks,
  });

  return res.status(httpStatus.status.OK).json({
    success: true,
    message: "Break started successfully",
    data: result,
  });
});

const breakOut = catchAsync(async (req, res) => {
  const result = await attendanceService.breakOut({
    employeeId: req.user.employeeId,
  });

  return res.status(httpStatus.status.OK).json({
    success: true,
    message: "Break ended successfully",
    data: result,
  });
});
const visitIn = catchAsync(async (req, res) => {

  console.log(req.fileUrls, "req.fileUrls");
  const jsonData = JSON.parse(req.body.jsonData);

  const result = await attendanceService.visitIn({
    employeeId: req.user.employeeId,
    visitType: jsonData.visitType,
    customerName: jsonData.customerName,
    purpose: jsonData.purpose,
    remarks: jsonData.remarks,
    latitude: jsonData.latitude,
    longitude: jsonData.longitude,
    address: jsonData.address,
    imageUrl: req.fileUrls?.image,
  });

  return res.status(httpStatus.status.OK).json({
    success: true,
    message: "Visit started successfully.",
    data: result,
  });
});

const visitOut = catchAsync(async (req, res) => {
  const jsonData = JSON.parse(req.body.jsonData);

  const result = await attendanceService.visitOut({
    employeeId: req.user.employeeId,
    remarks: jsonData.remarks,
    latitude: jsonData.latitude,
    longitude: jsonData.longitude,
    address: jsonData.address,
    imageUrl: req.fileUrls?.image,
  });

  return res.status(httpStatus.status.OK).json({
    success: true,
    message: "Visit completed successfully.",
    data: result,
  });
});

const regularizeAttendance = catchAsync(async (req, res) => {
  const { employeeId } = req.user;

  const {
    attendanceId,
    requestType,
    requestedPunchIn,
    requestedPunchOut,
    reason,
    attendanceDate
  } = req.body;

  if (!attendanceId || !requestType || !reason) {
    throw new ApiError(
      httpStatus.status.BAD_REQUEST,
      "Attendance ID, request type and reason are required."
    );
  }

  const result = await attendanceService.requestRegularization({
    employeeId,
    attendanceId,
    requestType,
    requestedPunchIn,
    requestedPunchOut,
    reason,
    attendanceDate
  });

  return res.status(httpStatus.status.OK).json({
    success: true,
    message: "Attendance regularization request submitted successfully.",
    data: result,
  });
});
const getRegularizeAttendanceRequests = catchAsync(async (req, res) => {
  const { employeeId } = req.user;

  const result = await attendanceService.getRegularizationRequests(employeeId);

  return res.status(httpStatus.status.OK).json({
    success: true,
    message: "Attendance regularization requests fetched successfully.",
    data: result,
  });
});
module.exports = {
  punchIn,
  punchOut,
  getAttendanceHistory,
  getAttendanceSummary,
  breakIn,
  breakOut,
  visitIn,
  visitOut,
  regularizeAttendance,
  getRegularizeAttendanceRequests
};