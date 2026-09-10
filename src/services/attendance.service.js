const moment = require("moment");
const geolib = require("geolib");
const httpStatus = require("http-status");
const { ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const ApiError = require("../utils/ApiError");
const Attendance = require("../models/attendance.model");
const Employee = require("../models/employee.model");
const Leave = require("../models/leave.model");
const Holiday = require("../models/holiday.model");
const HolidayCalendar = require("../models/holidayCalendar.model");
const ShiftPolicy = require('../models/shiftPolicy.model');
const LeaveType = require('../models/leaveType.model');
const LeaveBalance = require('../models/leaveBalance.model');
const Office = require('../models/office.model');
const { evaluateAttendance } = require("./attendanceEvaluator");
const { employeeService } = require(".");
const { Department } = require("../models");
const AttendanceRegularization = require("../models/attendanceRegularization.model");

const MAX_SELFIE_SIZE_MB = 5;

/**
 * Helper to convert UTC to local time (IST)
 */
const toLocalTime = (utcDate) => {
  return moment(utcDate).utcOffset('+05:30');
};

/* =========================================================
   UTIL: Get Active Holiday (Office Based)
========================================================= */
const checkHoliday = async (date, officeId) => {
  const year = moment(date).year();

  const calendar = await HolidayCalendar.findOne({
    year,
    office: officeId,
    isActive: true,
  });

  if (!calendar) return null;

  return Holiday.findOne({
    calendar: calendar._id,
    date: {
      $gte: moment(date).startOf("day").toDate(),
      $lte: moment(date).endOf("day").toDate(),
    },
    isActive: true,
  });
};

/* =========================================================
   UTIL: Weekly Off Engine
========================================================= */
const isTodayWeeklyOff = (policy, date) => {
  if (!policy) return false;
  if (policy.type === "NONE") return false;
  if (policy.type === "ALL_WEEKENDS") {
    const day = moment(date).format("dddd").toUpperCase();
    return day === "SATURDAY" || day === "SUNDAY";
  }

  if (policy.type === "CUSTOM") {
    const dayName = moment(date).format("dddd").toUpperCase();
    const weekOfMonth = Math.ceil(moment(date).date() / 7);

    return policy.customRules?.some(rule => {
      if (rule.day !== dayName) return false;
      if (!rule.weekNumbers || rule.weekNumbers.length === 0) return true;
      return rule.weekNumbers.includes(weekOfMonth);
    });
  }

  return false;
};

/* =========================================================
   UTIL: Update Employee Late Count
========================================================= */
const updateEmployeeLateCount = async (employeeId, date) => {
  const monthKey = moment(date).format("YYYY-MM");

  const employee = await Employee.findById(employeeId);
  if (!employee) return;

  if (!employee.lateCounts) {
    employee.lateCounts = [];
  }

  const monthEntry = employee.lateCounts.find(m => m.month === monthKey);

  if (monthEntry) {
    monthEntry.count += 1;
  } else {
    employee.lateCounts.push({ month: monthKey, count: 1 });
  }

  await employee.save();
};

/* =========================================================
   UTIL: Validate Geofence
========================================================= */
const validateGeofence = async (employee, location, office) => {
  const department = await Department.findOne({
    _id: new ObjectId(employee.department)
  });

  // ✅ Allow Sales employees without restriction
  if (department?.name === "Sales") {
    return true;
  }

  // 🔒 Apply geofence for others
  const distance = geolib.getDistance(
    { latitude: location.latitude, longitude: location.longitude },
    { latitude: office.location.latitude, longitude: office.location.longitude }
  );

  if (distance > office.radius) {
    throw new ApiError(
      httpStatus.status.BAD_REQUEST,
      `You are outside the office geofence. Distance: ${distance}m, Max allowed: ${office.radius}m`
    );
  }

  return true;
};

/* =========================================================
   PUNCH IN - With proper validation first
========================================================= */
const punchIn = async (payload) => {
  const { employeeId, latitude, longitude, address, imageBase64 } = payload;

  if (!latitude || !longitude) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Location is required");
  }

  // STEP 1: Validate employee exists and is active
  const employee = await Employee.findById(employeeId)
    .populate("shiftPolicy")
    .populate("office")
    .populate("weeklyOffPolicy");

  if (!employee) {
    throw new ApiError(httpStatus.status.NOT_FOUND, "Employee not found");
  }

  if (!employee.isActive) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Employee is inactive");
  }


  // STEP 2: Validate policies and office exist
  const policy = await ShiftPolicy.findById(employee.shiftPolicy);
  const office = await Office.findById(employee.office);

  if (!policy) {
    throw new ApiError(httpStatus.status.NOT_FOUND, "Shift policy not found for employee");
  }

  if (!office) {
    throw new ApiError(httpStatus.status.NOT_FOUND, "Office not found for employee");
  }

  // STEP 3: Validate geofence FIRST - before any attendance operations
  try {
    await validateGeofence(employee, { latitude, longitude }, office);
  } catch (error) {
    throw error; // Re-throw the ApiError
  }

  // STEP 4: Now proceed with attendance operations
  const now = new Date(); // UTC
  const todayStart = moment.utc().startOf("day").toDate();


  // Check for existing attendance
  let attendance = await Attendance.findOne({
    employee: employeeId,
    date: todayStart,
  });

  if (!attendance) {
    attendance = new Attendance({
      employee: employeeId,
      date: todayStart,
      sessions: [],
      attendanceStatus: "PRESENT",
      status: "PRESENT"
    });
  } else {
  }

  // Check if already punched in
  const lastSession = attendance.sessions[attendance.sessions.length - 1];
  if (lastSession && !lastSession.punchOut) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Already punched in. Please punch out first.");
  }

  // Check for holiday/weekly off (for informational purposes only)
  const holiday = await checkHoliday(now, office._id);
  const weeklyOff = isTodayWeeklyOff(employee.weeklyOffPolicy, now);

  let initialStatus = "PRESENT";
  if (holiday) {
    initialStatus = "HOLIDAY";
  } else if (weeklyOff) {
    initialStatus = "WEEK_OFF";
  }

  // Create new session
  attendance.sessions.push({
    punchIn: now,
    punchInLocation: {
      latitude,
      longitude,
      address: address || "",
      imageUrl: imageBase64 || null,
    },
  });

  // Set first punch in if not set
  if (!attendance.firstPunchIn) {
    attendance.firstPunchIn = now;
  }

  // Set initial status before evaluation
  attendance.attendanceStatus = initialStatus;
  attendance.status = "PRESENT";

  // Run evaluation to set all flags and final status
  const evaluatedAttendance = evaluateAttendance(attendance, policy, employee);
  attendance.attendanceStatus = evaluatedAttendance.attendanceStatus;

  await attendance.save();



  return attendance;
};

/* =========================================================
   PUNCH OUT - With proper validation first
========================================================= */
const punchOut = async (payload) => {
  const { employeeId, latitude, longitude, address, imageBase64 } = payload;

  if (!latitude || !longitude) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Location is required");
  }


  // STEP 1: Validate employee exists and is active
  const employee = await Employee.findById(employeeId)
    .populate("shiftPolicy")
    .populate("office")
    .populate("weeklyOffPolicy");

  if (!employee) {
    throw new ApiError(httpStatus.status.NOT_FOUND, "Employee not found");
  }

  if (!employee.isActive) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Employee is inactive");
  }


  // STEP 2: Validate policies and office exist
  const policy = await ShiftPolicy.findById(employee.shiftPolicy);
  const office = await Office.findById(employee.office);

  if (!policy) {
    throw new ApiError(httpStatus.status.NOT_FOUND, "Shift policy not found for employee");
  }

  if (!office) {
    throw new ApiError(httpStatus.status.NOT_FOUND, "Office not found for employee");
  }

  // STEP 3: Validate geofence FIRST - before any attendance operations
  await validateGeofence(employee, { latitude, longitude }, office);
  // try {
  // } catch (error) {
  //   throw error; // Re-throw the ApiError
  // }

  // STEP 4: Now proceed with attendance operations
  const now = new Date(); // UTC
  const todayStart = moment.utc().startOf("day").toDate();



  // Find attendance record
  const attendance = await Attendance.findOne({
    employee: employeeId,
    date: todayStart,
  });

  if (!attendance) {
    throw new ApiError(httpStatus.status.NOT_FOUND, "No punch in found for today. Please punch in first.");
  }



  // Check for active session
  const lastSession = attendance.sessions[attendance.sessions.length - 1];

  if (!lastSession) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "No sessions found for today");
  }

  if (lastSession.punchOut) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Already punched out for the current session");
  }



  // Calculate session duration
  const duration = moment(now).diff(moment(lastSession.punchIn), "minutes");

  if (duration <= 0) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Punch out time must be after punch in time");
  }

  // Update session with punch out details
  lastSession.punchOut = now;
  lastSession.durationMinutes = duration;
  lastSession.punchOutLocation = {
    latitude,
    longitude,
    address: address || "",
    imageUrl: imageBase64 || null,
  };

  attendance.totalWorkingMinutes = (attendance.totalWorkingMinutes || 0) + duration;
  attendance.lastPunchOut = now;

  // Run evaluation to calculate final status
  const evaluatedAttendance = evaluateAttendance(attendance, policy, employee);

  // Update all fields from evaluation
  attendance.attendanceStatus = evaluatedAttendance.attendanceStatus;
  attendance.isHalfDay = evaluatedAttendance.isHalfDay;
  attendance.halfDayType = evaluatedAttendance.halfDayType;
  attendance.morningShortLeave = evaluatedAttendance.morningShortLeave;
  attendance.eveningShortLeave = evaluatedAttendance.eveningShortLeave;
  attendance.isLate = evaluatedAttendance.isLate;
  attendance.lateMinutes = evaluatedAttendance.lateMinutes;
  attendance.isEarlyLeave = evaluatedAttendance.isEarlyLeave;
  attendance.earlyLeaveMinutes = evaluatedAttendance.earlyLeaveMinutes;
  attendance.status = "ABSENT"; // Set status to match attendanceStatus

  // Update late count if late
  if (attendance.isLate) {
    await updateEmployeeLateCount(employeeId, now);
  }

  // Final save
  await attendance.save();

  if (attendance.isHalfDay) {
  }
  if (attendance.morningShortLeave?.isShortLeave) {

  }
  if (attendance.eveningShortLeave?.isShortLeave) {
  }

  if (
    attendance?.morningShortLeave?.isShortLeave ||
    attendance?.eveningShortLeave?.isShortLeave
  ) {

    console.log("Short leave taken. Updating leave balances...");
    const current = new Date(now.toISOString().split("T")[0]);
    const month = current.getMonth() + 1;
    const year = current.getFullYear();

    // ----------------------------
    // SHORT LEAVE BALANCE
    // ----------------------------
    const shortLeaveType = await LeaveType.findOne({
      code: "SL",
    });

    const shortLeaveBalance = await LeaveBalance.findOne({
      employeeId: attendance.employee._id,
      leaveTypeId: shortLeaveType._id,
      month,
      year,
    });

    // Use Short Leave if available
    if (shortLeaveBalance && shortLeaveBalance.remaining > 0) {
      shortLeaveBalance.used += 1;
      shortLeaveBalance.remaining -= 1;

      await shortLeaveBalance.save();
    } else {
      // ----------------------------
      // EARNED LEAVE BALANCE
      // ----------------------------
      const earnedLeaveType = await LeaveType.findOne({
        code: "EL",
      });

      const earnedLeaveBalance = await LeaveBalance.findOne({
        employeeId: attendance.employee._id,
        leaveTypeId: earnedLeaveType._id,
        month,
        year,
      });

      const deduction = 0.5;

      if (
        earnedLeaveBalance &&
        earnedLeaveBalance.remaining >= deduction
      ) {
        earnedLeaveBalance.used += deduction;
        earnedLeaveBalance.remaining -= deduction;
      } else {
        // EL exhausted → LOP
        earnedLeaveBalance.lop += deduction;
      }

      await earnedLeaveBalance.save();
    }
  }

  return attendance;
};

/* =========================================================
   BREAK IN - With proper timezone handling
========================================================= */
const breakIn = async (payload) => {
  const { employeeId, breakType, remarks } = payload;

  const startOfDay = moment.utc().startOf("day").toDate();
  const endOfDay = moment.utc().endOf("day").toDate();
  const now = new Date();

  const attendance = await Attendance.findOne({
    employee: employeeId,
    date: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  if (!attendance || attendance.sessions.length === 0) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "No active session found. Punch in first.");
  }

  const currentSession = attendance.sessions[attendance.sessions.length - 1];

  if (currentSession.punchOut) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Session already closed. Cannot take break.");
  }

  const breaks = currentSession.breaks || [];
  const lastBreak = breaks[breaks.length - 1];

  if (lastBreak && !lastBreak.breakOut) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Break already active. Please end current break first.");
  }

  breaks.push({
    breakIn: now,
    breakType: breakType || "OTHER",
    remarks: remarks || "",
  });

  currentSession.breaks = breaks;
  attendance.breakCount = (attendance.breakCount || 0) + 1;

  await attendance.save();

  return attendance;
};

/* =========================================================
   BREAK OUT - With proper timezone handling
========================================================= */
const breakOut = async (payload) => {
  const { employeeId } = payload;

  const startOfDay = moment.utc().startOf("day").toDate();
  const endOfDay = moment.utc().endOf("day").toDate();
  const now = new Date();

  const attendance = await Attendance.findOne({
    employee: employeeId,
    date: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  if (!attendance || attendance.sessions.length === 0) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "No active session found. Punch in first.");
  }

  const currentSession = attendance.sessions[attendance.sessions.length - 1];
  const breaks = currentSession.breaks || [];

  if (breaks.length === 0) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "No break found. Start a break first.");
  }

  const currentBreak = breaks[breaks.length - 1];

  if (currentBreak.breakOut) {
    throw new ApiError(httpStatus.status.BAD_REQUEST, "Break already ended.");
  }

  currentBreak.breakOut = now;

  const durationMinutes = Math.ceil(moment(now).diff(moment(currentBreak.breakIn), "minutes"));
  currentBreak.durationMinutes = durationMinutes;

  attendance.totalBreakMinutes = (attendance.totalBreakMinutes || 0) + durationMinutes;

  await attendance.save();

  return attendance;
};



const visitIn = async (payload) => {
  console.log("visitIn payload:", payload);
  const {
    employeeId,
    visitType,
    customerName,
    purpose,
    remarks,
    latitude,
    longitude,
    address,
    imageUrl,
  } = payload;

  const startOfDay = moment.utc().startOf("day").toDate();
  const endOfDay = moment.utc().endOf("day").toDate();
  const now = new Date();

  const attendance = await Attendance.findOne({
    employee: employeeId,
    date: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  if (!attendance || attendance.sessions.length === 0) {
    throw new ApiError(
      httpStatus.status.BAD_REQUEST,
      "No active session found. Please punch in first."
    );
  }

  const currentSession =
    attendance.sessions[attendance.sessions.length - 1];

  if (currentSession.punchOut) {
    throw new ApiError(
      httpStatus.status.BAD_REQUEST,
      "Current session has already ended."
    );
  }

  const visits = currentSession.visits || [];

  const activeVisit = visits.find((v) => !v.visitOut);

  if (activeVisit) {
    throw new ApiError(
      httpStatus.status.BAD_REQUEST,
      "A visit is already in progress."
    );
  }

  console.log("Adding new visit:", {
    visitType: visitType || "CLIENT_VISIT",
    customerName,
    purpose,
    remarks,

    visitIn: now,

    status: "IN_PROGRESS",

    punchInLocation: {
      latitude,
      longitude,
      address,
      imageUrl,
    },
  })

  visits.push({
    visitType: visitType || "CLIENT_VISIT",
    customerName,
    purpose,
    remarks,

    visitIn: now,

    status: "IN_PROGRESS",

    punchInLocation: {
      latitude,
      longitude,
      address,
      imageUrl,
    },
  });

  currentSession.visits = visits;

  await attendance.save();

  return attendance;
};

const visitOut = async (payload) => {
  const {
    employeeId,
    remarks,
    latitude,
    longitude,
    address,
    imageUrl,
  } = payload;

  const startOfDay = moment.utc().startOf("day").toDate();
  const endOfDay = moment.utc().endOf("day").toDate();
  const now = new Date();

  const attendance = await Attendance.findOne({
    employee: employeeId,
    date: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  if (!attendance || attendance.sessions.length === 0) {
    throw new ApiError(
      httpStatus.status.BAD_REQUEST,
      "No active session found."
    );
  }

  const currentSession =
    attendance.sessions[attendance.sessions.length - 1];

  if (currentSession.punchOut) {
    throw new ApiError(
      httpStatus.status.BAD_REQUEST,
      "Current session has already ended."
    );
  }

  const visits = currentSession.visits || [];

  const activeVisit = visits.find((v) => !v.visitOut);

  if (!activeVisit) {
    throw new ApiError(
      httpStatus.status.BAD_REQUEST,
      "No active visit found."
    );
  }

  activeVisit.visitOut = now;

  activeVisit.durationMinutes = Math.round(
    (now - activeVisit.visitIn) / (1000 * 60)
  );

  activeVisit.status = "COMPLETED";

  activeVisit.remarks = remarks || activeVisit.remarks;

  activeVisit.punchOutLocation = {
    latitude,
    longitude,
    address,
    imageUrl,
  };

  await attendance.save();

  return attendance;
};

const getAttendanceForEmployee = async (
  filterQuery,
  start,
  end
) => {
  try {
    /* =====================================================
       0️⃣ GET EMPLOYEE DETAILS
    ===================================================== */
    const emp = await Employee.aggregate([
      {
        $match: {
          _id: new ObjectId(filterQuery.employee),
        },
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
    ]);

    if (!emp.length) {
      return {
        data: [],
        pagination: {
          page: 1,
          limit: 0,
          total: 0,
          pages: 0,
        },
      };
    }

    const employee = emp[0];

    /* =====================================================
       1️⃣ GET APPROVED LEAVES
    ===================================================== */
    const leaves = await Leave.find({
      employee: filterQuery.employee,
      status: "APPROVED",
    });

    /* =====================================================
       2️⃣ CREATE LEAVE DATE MAP (Timezone Safe)
    ===================================================== */
    const leaveMap = new Set();

    for (const leaveRecord of leaves) {
      if (!leaveRecord.startDate) continue;

      // Create UTC-based dates to avoid timezone shifts
      const leaveStart = new Date(leaveRecord.startDate);
      const leaveEnd = leaveRecord.endDate
        ? new Date(leaveRecord.endDate)
        : new Date(leaveRecord.startDate);

      // Get UTC dates to ensure consistency
      const startUTC = Date.UTC(
        leaveStart.getUTCFullYear(),
        leaveStart.getUTCMonth(),
        leaveStart.getUTCDate()
      );

      const endUTC = Date.UTC(
        leaveEnd.getUTCFullYear(),
        leaveEnd.getUTCMonth(),
        leaveEnd.getUTCDate()
      );

      for (let time = startUTC; time <= endUTC; time += 86400000) {
        const dateStr = new Date(time).toDateString();
        leaveMap.add(dateStr);
      }
    }

    /* =====================================================
       3️⃣ JOINING DATE (Timezone Safe)
    ===================================================== */
    const joiningDateUTC = new Date(employee.joiningDate);
    const joiningDate = new Date(Date.UTC(
      joiningDateUTC.getUTCFullYear(),
      joiningDateUTC.getUTCMonth(),
      joiningDateUTC.getUTCDate()
    ));

    /* =====================================================
       4️⃣ DEFAULT RANGE (Timezone Safe)
    ===================================================== */
    let startDate, endDate;

    if (!start || !end) {
      startDate = new Date(joiningDate);

      const now = new Date();
      endDate = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23, 59, 59, 999
      ));
    } else {
      startDate = new Date(start);
      endDate = new Date(end);
    }

    // Normalize to UTC date boundaries
    startDate = new Date(Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
      0, 0, 0, 0
    ));

    endDate = new Date(Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
      23, 59, 59, 999
    ));

    /* =====================================================
       5️⃣ PREVENT BEFORE JOINING DATE
    ===================================================== */
    if (startDate < joiningDate) {
      startDate = new Date(joiningDate);
    }

    /* =====================================================
       6️⃣ FETCH ATTENDANCE (Timezone Safe Query)
    ===================================================== */
    // Create date boundaries for query
    const queryStartDate = new Date(startDate);
    queryStartDate.setUTCHours(0, 0, 0, 0);

    const queryEndDate = new Date(endDate);
    queryEndDate.setUTCHours(23, 59, 59, 999);

    const attendance = await Attendance.aggregate([
      {
        $match: {
          employee: new ObjectId(filterQuery.employee),
          date: {
            $gte: queryStartDate,
            $lte: queryEndDate,
          },
        },
      },

      {
        $sort: {
          updatedAt: -1,
          createdAt: -1,
        },
      },

      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$date",
              timezone: "UTC"
            }
          },
          doc: { $first: "$$ROOT" },
        },
      },

      {
        $replaceRoot: {
          newRoot: "$doc",
        },
      },

      {
        $addFields: {
          firstPunchInLocal: {
            $cond: [
              "$firstPunchIn",
              {
                $dateToString: {
                  format: "%Y-%m-%d %H:%M:%S",
                  date: "$firstPunchIn",
                  timezone: "+05:30",
                },
              },
              null,
            ],
          },

          lastPunchOutLocal: {
            $cond: [
              "$lastPunchOut",
              {
                $dateToString: {
                  format: "%Y-%m-%d %H:%M:%S",
                  date: "$lastPunchOut",
                  timezone: "+05:30",
                },
              },
              null,
            ],
          },

          // Add UTC date string for consistent grouping
          dateUTC: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$date",
              timezone: "UTC"
            }
          }
        },
      },

      {
        $project: {
          _id: 1,
          date: 1,

          firstPunchIn: 1,
          firstPunchInLocal: 1,

          lastPunchOut: 1,
          lastPunchOutLocal: 1,

          attendanceStatus: 1,
          status: 1,

          sessions: 1,

          isLate: 1,
          lateMinutes: 1,

          isEarlyLeave: 1,
          earlyLeaveMinutes: 1,

          isHalfDay: 1,
          halfDayType: 1,

          totalWorkingMinutes: 1,
          totalBreakMinutes: 1,

          breakCount: 1,

          morningShortLeave: 1,
          eveningShortLeave: 1,

          employee: {
            _id: employee._id,
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            email: employee.email,

            departmentId: employee.department?._id,
            departmentName: employee.department?.name,

            designationId: employee.designation?._id,
            designationName: employee.designation?.title,
          },
        },
      },
    ]);

    /* =====================================================
       7️⃣ FETCH ATTENDANCE REGULARIZATIONS
    ===================================================== */
    // Get all attendance IDs from the fetched attendance records
    const attendanceIds = attendance.map(record => record._id).filter(id => id);

    let regularizationMap = new Map();

    if (attendanceIds.length > 0) {
      // Fetch all regularizations for these attendance records
      const regularizations = await AttendanceRegularization.find({
        attendanceId: { $in: attendanceIds },
        // Optionally filter by status if needed (e.g., only PENDING or APPROVED)
        // status: { $in: ["PENDING", "APPROVED"] }
      }).lean();

      // Create a map of attendanceId -> regularization record(s)
      // If there can be multiple regularizations per attendance, store as array
      regularizations.forEach(reg => {
        const attendanceId = reg.attendanceId.toString();
        if (!regularizationMap.has(attendanceId)) {
          regularizationMap.set(attendanceId, []);
        }
        regularizationMap.get(attendanceId).push(reg);
      });
    }

    /* =====================================================
       8️⃣ MAP ATTENDANCE (Using UTC date)
    ===================================================== */
    const attendanceMap = new Map();

    attendance.forEach((item) => {
      // Use UTC date to create consistent key
      const itemDate = new Date(item.date);
      const utcKey = Date.UTC(
        itemDate.getUTCFullYear(),
        itemDate.getUTCMonth(),
        itemDate.getUTCDate()
      );
      const key = new Date(utcKey).toDateString();

      // Store attendance with its ID for regularization lookup
      const attendanceWithReg = {
        ...item,
        regularizations: [] // Will be populated later
      };

      // Only keep the first record for each date (in case of duplicates)
      if (!attendanceMap.has(key)) {
        attendanceMap.set(key, attendanceWithReg);
      }
    });

    // Now populate regularizations for each attendance record
    for (const [key, record] of attendanceMap) {
      if (record._id) {
        const regs = regularizationMap.get(record._id.toString()) || [];
        record.regularizations = regs;
      }
    }

    /* =====================================================
       9️⃣ BUILD DATE RANGE (Timezone Safe)
    ===================================================== */
    const result = [];

    const currentDateIterator = new Date(startDate);

    while (currentDateIterator <= endDate) {
      // Create UTC-based date to avoid timezone shifts
      const currentDateUTC = new Date(Date.UTC(
        currentDateIterator.getUTCFullYear(),
        currentDateIterator.getUTCMonth(),
        currentDateIterator.getUTCDate()
      ));

      const key = currentDateUTC.toDateString();

      /* =====================================================
         WEEK OFF LOGIC (Based on local date)
         Sunday + 2nd Saturday + 4th Saturday
      ===================================================== */
      // For week-off calculation, use the local date representation
      const localDate = new Date(
        currentDateUTC.getUTCFullYear(),
        currentDateUTC.getUTCMonth(),
        currentDateUTC.getUTCDate()
      );

      const day = localDate.getDay();

      let isWeekOff = false;

      // Sunday
      if (day === 0) {
        isWeekOff = true;
      }

      // 2nd & 4th Saturday
      if (day === 6) {
        const dateOfMonth = localDate.getDate();

        const saturdayNumber =
          Math.floor((dateOfMonth - 1) / 7) + 1;

        if (
          saturdayNumber === 2 ||
          saturdayNumber === 4
        ) {
          isWeekOff = true;
        }
      }

      const isOnLeave = leaveMap.has(key);

      /* =====================================================
         ATTENDANCE EXISTS
      ===================================================== */
      if (attendanceMap.has(key)) {
        const attendanceRecord = attendanceMap.get(key);
        // Ensure the date in the record is properly set
        if (attendanceRecord.date) {
          result.push(attendanceRecord);
        } else {
          attendanceRecord.date = currentDateUTC;
          result.push(attendanceRecord);
        }
      } else {
        /* =====================================================
           NO ATTENDANCE RECORD
        ===================================================== */
        result.push({
          _id: null,

          date: currentDateUTC,

          firstPunchIn: null,
          firstPunchInLocal: null,

          lastPunchOut: null,
          lastPunchOutLocal: null,

          attendanceStatus: isWeekOff
            ? "WEEK_OFF"
            : isOnLeave
              ? "ON_LEAVE"
              : "ABSENT",

          status: isWeekOff
            ? "WEEK_OFF"
            : isOnLeave
              ? "ON_LEAVE"
              : "ABSENT",

          sessions: [],

          isLate: false,
          lateMinutes: 0,

          isEarlyLeave: false,
          earlyLeaveMinutes: 0,

          isHalfDay: false,
          halfDayType: null,

          totalWorkingMinutes: 0,
          totalBreakMinutes: 0,

          breakCount: 0,

          morningShortLeave: false,
          eveningShortLeave: false,

          employee: {
            _id: employee._id,
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            email: employee.email,

            departmentId: employee.department?._id,
            departmentName: employee.department?.name,

            designationId: employee.designation?._id,
            designationName: employee.designation?.title,
          },

          // Add empty regularizations array for days without attendance
          regularizations: [],
        });
      }

      // Increment by 1 day in UTC
      currentDateIterator.setUTCDate(currentDateIterator.getUTCDate() + 1);
    }

    /* =====================================================
       🔟 SORT DESC (Using UTC date)
    ===================================================== */
    result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    /* =====================================================
       1️⃣1️⃣ RETURN
    ===================================================== */
    return {
      data: result,
      pagination: {
        page: 1,
        limit: result.length,
        total: result.length,
        pages: 1,
      },
    };
  } catch (error) {
    throw error;
  }
};

/**
 * SAFE optimization pass with LEAVE integration.
 * 
 * Now properly handles ON_LEAVE status instead of marking absent employees as ABSENT.
 */

const getAttendanceForAdmin = async (filterQuery, employeeMatchQuery, page = 1, limit = 10) => {
  try {
    const skip = (page - 1) * limit;
    const selectedDate = filterQuery.date?.$gte || new Date();

    // Normalize selectedDate to start of day for consistent comparison
    const normalizedSelectedDate = new Date(selectedDate);
    normalizedSelectedDate.setHours(0, 0, 0, 0);

    /* ================================
       1️⃣ EMPLOYEES (fetched ONCE, with department/designation)
    ================================ */
    const employees = await Employee.aggregate([
      { $match: employeeMatchQuery },
      {
        $lookup: {
          from: 'departments',
          localField: 'department',
          foreignField: '_id',
          as: 'department',
        },
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'designations',
          localField: 'designation',
          foreignField: '_id',
          as: 'designation',
        },
      },
      { $unwind: { path: '$designation', preserveNullAndEmptyArrays: true } },
    ]);

    const employeeById = new Map(employees.map((e) => [e._id.toString(), e]));
    const employeeIds = employees.map((e) => e._id);

    /* ================================
       2️⃣ FETCH LEAVES FOR THE SELECTED DATE
    ================================ */
    // Get all approved leaves that cover the selected date
    const dayStart = new Date(normalizedSelectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(normalizedSelectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const approvedLeaves = await Leave.find({
      employee: { $in: employeeIds },
      status: "APPROVED",
      startDate: { $lte: dayEnd },
      $or: [
        { endDate: { $gte: dayStart } },
        { endDate: null } // Single day leave
      ]
    })
      .select("employee startDate endDate")
      .lean();

    // Build a Set of employee IDs who are on leave for the selected date
    const onLeaveEmployeeIds = new Set();

    for (const leave of approvedLeaves) {
      const leaveStart = new Date(leave.startDate);
      leaveStart.setHours(0, 0, 0, 0);

      const leaveEnd = leave.endDate ? new Date(leave.endDate) : new Date(leave.startDate);
      leaveEnd.setHours(0, 0, 0, 0);

      if (normalizedSelectedDate >= leaveStart && normalizedSelectedDate <= leaveEnd) {
        onLeaveEmployeeIds.add(leave.employee.toString());
      }
    }

    /* ================================
       3️⃣ ATTENDANCE (DEDUPED — no lookups here anymore)
    ================================ */
    // Restrict the attendance query to exactly this employee set
    const scopedFilterQuery = {
      ...filterQuery,
      employee: { $in: employeeIds },
    };

    const attendance = await Attendance.aggregate([
      { $match: scopedFilterQuery },
      { $sort: { employee: 1, date: -1, updatedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: { employee: '$employee', date: '$date' },
          doc: { $first: '$$ROOT' },
        },
      },
      { $replaceRoot: { newRoot: '$doc' } },
      {
        $addFields: {
          firstPunchInLocal: {
            $cond: [
              '$firstPunchIn',
              {
                $dateToString: {
                  format: '%Y-%m-%d %H:%M:%S',
                  date: '$firstPunchIn',
                  timezone: '+05:30',
                },
              },
              null,
            ],
          },
          lastPunchOutLocal: {
            $cond: [
              '$lastPunchOut',
              {
                $dateToString: {
                  format: '%Y-%m-%d %H:%M:%S',
                  date: '$lastPunchOut',
                  timezone: '+05:30',
                },
              },
              null,
            ],
          },
        },
      },
    ]);

    /* ================================
       4️⃣ ATTACH EMPLOYEE INFO (from the Map, not a second DB round trip)
    ================================ */
    const attendanceWithEmployee = attendance
      .filter((a) => employeeById.has(a.employee.toString()))
      .map((a) => {
        const emp = employeeById.get(a.employee.toString());
        return {
          ...a,
          employee: {
            _id: emp._id,
            employeeCode: emp.employeeCode,
            fullName: emp.fullName,
            email: emp.email,
            departmentId: emp.department?._id,
            departmentName: emp.department?.name,
            designationId: emp.designation?._id,
            designationName: emp.designation?.title,
          },
        };
      });

    /* ================================
       5️⃣ PRESENT SET (only for employees who are NOT on leave)
    ================================ */
    const presentSet = new Set(
      attendanceWithEmployee
        .filter((a) => !onLeaveEmployeeIds.has(a.employee._id.toString()))
        .map((a) => `${a.employee._id.toString()}_${new Date(a.date).toDateString()}`)
    );

    /* ================================
       6️⃣ ABSENT + ON LEAVE (WITH JOINING CHECK)
    ================================ */
    const absentAndOnLeaveEmployees = employees
      .filter((emp) => {
        const joiningDate = new Date(emp.joiningDate);
        joiningDate.setHours(0, 0, 0, 0);
        if (normalizedSelectedDate < joiningDate) return false;
        // If already in attendance, skip (already handled above)
        return !presentSet.has(`${emp._id.toString()}_${normalizedSelectedDate.toDateString()}`);
      })
      .map((emp) => {
        const isOnLeave = onLeaveEmployeeIds.has(emp._id.toString());
        const status = isOnLeave ? 'ON_LEAVE' : 'ABSENT';

        return {
          _id: null,
          date: selectedDate,
          firstPunchIn: null,
          firstPunchInLocal: null,
          lastPunchOut: null,
          lastPunchOutLocal: null,
          attendanceStatus: status,
          status: status,
          sessions: [],
          isLate: false,
          lateMinutes: 0,
          isEarlyLeave: false,
          earlyLeaveMinutes: 0,
          isHalfDay: false,
          halfDayType: null,
          totalWorkingMinutes: 0,
          totalBreakMinutes: 0,
          breakCount: 0,
          morningShortLeave: false,
          eveningShortLeave: false,
          employee: {
            _id: emp._id,
            employeeCode: emp.employeeCode,
            fullName: emp.fullName,
            email: emp.email,
            departmentId: emp.department?._id,
            departmentName: emp.department?.name,
            designationId: emp.designation?._id,
            designationName: emp.designation?.title,
          },
        };
      });

    /* ================================
       7️⃣ MERGE + SORT (unchanged rule, done once)
    ================================ */
    const finalData = [...attendanceWithEmployee, ...absentAndOnLeaveEmployees];

    const statusPriority = {
      PRESENT: 1,
      HALF_DAY: 2,
      SHORT_LEAVE: 3,
      ON_LEAVE: 4,
      ABSENT: 5,
      HOLIDAY: 6,
      WEEK_OFF: 7,
    };

    finalData.sort((a, b) => {
      const priorityA = statusPriority[a.attendanceStatus] || 99;
      const priorityB = statusPriority[b.attendanceStatus] || 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return (a.employee.fullName || '').localeCompare(b.employee.fullName || '');
    });

    /* ================================
       8️⃣ PAGINATE
    ================================ */
    const total = finalData.length;
    const pagedData = finalData.slice(skip, skip + limit);

    return {
      data: pagedData,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    throw error;
  }
};


// /**
//  * SAFE optimization pass.
//  *
//  * Keeps the exact same two-step logic as your original (fetch attendance,
//  * fetch employees, diff to find absentees, merge, sort) so behavior stays
//  * identical. Only fixes actual bugs / waste:
//  *
//  *  1. Employees are now fetched ONCE (was: once in controller via Employee.find,
//  *     once here via Employee.aggregate — same collection, same filter, twice).
//  *  2. Department/designation lookups on the ATTENDANCE pipeline are removed —
//  *     we already have that data from the single employee fetch, so we attach
//  *     it via an in-memory Map instead of two extra $lookup stages per document.
//  *  3. Pagination is actually applied. Before: `skip`/`limit` were computed
//  *     but `finalData` (the full merged set) was returned untouched every time.
//  *  4. The attendance pipeline's `$sort` stage is removed — it was immediately
//  *     discarded by the JS `.sort()` on the merged array, so it was pure
//  *     wasted work on every request.
//  *  5. Absent-employee generation and the present/absent diff now use a Map
//  *     instead of building/scanning a Set of string keys — same complexity,
//  *     less string churn.
//  *
//  * This does NOT change the query shape (still Attendance.aggregate for dedup +
//  * Employee.aggregate for the roster) so it's low-risk relative to your
//  * current working version. See attendance-indexes.js for the index this
//  * still needs to make the Attendance $match/$sort/$group fast.
//  */

// const getAttendanceForAdmin = async (filterQuery, employeeMatchQuery, page = 1, limit = 10) => {
//   try {
//     const skip = (page - 1) * limit;
//     const selectedDate = filterQuery.date?.$gte || new Date();

//     /* ================================
//        1️⃣ EMPLOYEES (fetched ONCE, with department/designation)
//     ================================ */
//     const employees = await Employee.aggregate([
//       { $match: employeeMatchQuery },
//       {
//         $lookup: {
//           from: 'departments',
//           localField: 'department',
//           foreignField: '_id',
//           as: 'department',
//         },
//       },
//       { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
//       {
//         $lookup: {
//           from: 'designations',
//           localField: 'designation',
//           foreignField: '_id',
//           as: 'designation',
//         },
//       },
//       { $unwind: { path: '$designation', preserveNullAndEmptyArrays: true } },
//     ]);

//     const employeeById = new Map(employees.map((e) => [e._id.toString(), e]));

//     // Restrict the attendance query to exactly this employee set — this was
//     // already happening via matchQuery.employee in your controller; keeping
//     // it here too in case this service is ever called without that filter.
//     const scopedFilterQuery = {
//       ...filterQuery,
//       employee: { $in: employees.map((e) => e._id) },
//     };

//     /* ================================
//        2️⃣ ATTENDANCE (DEDUPED — no lookups here anymore)
//     ================================ */
//     const attendance = await Attendance.aggregate([
//       { $match: scopedFilterQuery },
//       { $sort: { employee: 1, date: -1, updatedAt: -1, createdAt: -1 } },
//       {
//         $group: {
//           _id: { employee: '$employee', date: '$date' },
//           doc: { $first: '$$ROOT' },
//         },
//       },
//       { $replaceRoot: { newRoot: '$doc' } },
//       {
//         $addFields: {
//           firstPunchInLocal: {
//             $cond: [
//               '$firstPunchIn',
//               {
//                 $dateToString: {
//                   format: '%Y-%m-%d %H:%M:%S',
//                   date: '$firstPunchIn',
//                   timezone: '+05:30',
//                 },
//               },
//               null,
//             ],
//           },
//           lastPunchOutLocal: {
//             $cond: [
//               '$lastPunchOut',
//               {
//                 $dateToString: {
//                   format: '%Y-%m-%d %H:%M:%S',
//                   date: '$lastPunchOut',
//                   timezone: '+05:30',
//                 },
//               },
//               null,
//             ],
//           },
//         },
//       },
//       // NOTE: no $sort here — it was discarded by the JS sort below in the
//       // original too, so removing it saves a full in-memory sort in Mongo
//       // for zero behavior change.
//     ]);

//     /* ================================
//        3️⃣ ATTACH EMPLOYEE INFO (from the Map, not a second DB round trip)
//     ================================ */
//     const attendanceWithEmployee = attendance
//       .filter((a) => employeeById.has(a.employee.toString()))
//       .map((a) => {
//         const emp = employeeById.get(a.employee.toString());
//         return {
//           ...a,
//           employee: {
//             _id: emp._id,
//             employeeCode: emp.employeeCode,
//             fullName: emp.fullName,
//             email: emp.email,
//             departmentId: emp.department?._id,
//             departmentName: emp.department?.name,
//             designationId: emp.designation?._id,
//             designationName: emp.designation?.title,
//           },
//         };
//       });

//     /* ================================
//        4️⃣ PRESENT SET
//     ================================ */
//     const presentSet = new Set(
//       attendanceWithEmployee.map(
//         (a) => `${a.employee._id.toString()}_${new Date(a.date).toDateString()}`
//       )
//     );

//     /* ================================
//        5️⃣ ABSENT (WITH JOINING CHECK) — same rule as original
//     ================================ */
//     const absentEmployees = employees
//       .filter((emp) => {
//         const joiningDate = new Date(emp.joiningDate);
//         joiningDate.setHours(0, 0, 0, 0);
//         if (selectedDate < joiningDate) return false;
//         return !presentSet.has(`${emp._id.toString()}_${new Date(selectedDate).toDateString()}`);
//       })
//       .map((emp) => ({
//         _id: null,
//         date: selectedDate,
//         firstPunchIn: null,
//         firstPunchInLocal: null,
//         lastPunchOut: null,
//         lastPunchOutLocal: null,
//         attendanceStatus: 'ABSENT',
//         status: 'ABSENT',
//         sessions: [],
//         isLate: false,
//         lateMinutes: 0,
//         isEarlyLeave: false,
//         earlyLeaveMinutes: 0,
//         isHalfDay: false,
//         halfDayType: null,
//         totalWorkingMinutes: 0,
//         totalBreakMinutes: 0,
//         breakCount: 0,
//         morningShortLeave: false,
//         eveningShortLeave: false,
//         employee: {
//           _id: emp._id,
//           employeeCode: emp.employeeCode,
//           fullName: emp.fullName,
//           email: emp.email,
//           departmentId: emp.department?._id,
//           departmentName: emp.department?.name,
//           designationId: emp.designation?._id,
//           designationName: emp.designation?.title,
//         },
//       }));

//     /* ================================
//        6️⃣ MERGE + SORT (unchanged rule, done once)
//     ================================ */
//     const finalData = [...attendanceWithEmployee, ...absentEmployees];

//     const statusPriority = {
//       PRESENT: 1,
//       HALF_DAY: 2,
//       SHORT_LEAVE: 3,
//       ON_LEAVE: 4,
//       ABSENT: 5,
//       HOLIDAY: 6,
//       WEEK_OFF: 7,
//     };

//     finalData.sort((a, b) => {
//       const priorityA = statusPriority[a.attendanceStatus] || 99;
//       const priorityB = statusPriority[b.attendanceStatus] || 99;
//       if (priorityA !== priorityB) return priorityA - priorityB;
//       return (a.employee.fullName || '').localeCompare(b.employee.fullName || '');
//     });

//     /* ================================
//        7️⃣ PAGINATE (this was missing entirely before)
//     ================================ */
//     const total = finalData.length;
//     const pagedData = finalData.slice(skip, skip + limit);

//     return {
//       data: pagedData,
//       pagination: {
//         page: parseInt(page, 10),
//         limit: parseInt(limit, 10),
//         total,
//         pages: Math.ceil(total / limit),
//       },
//     };
//   } catch (error) {
//     throw error;
//   }
// };


const getAttendanceSummary = async ({
  employeeId,
  date,
  startDate,
  endDate,
}, user) => {
  try {
    const filterQuery = {};

    const employeeMatchQuery = {
      isActive: true,
    };

    if (user.role === 'CEO') {
      employeeMatchQuery._id = {
        $ne: new ObjectId(user.employeeId)
      };
    }
    if (user.role == 'MANAGER') {
      employeeMatchQuery["reportingTo"] = new ObjectId(user.employeeId)
    }


    const employeess = await employeeService.getEmployees(employeeMatchQuery);

    const employeeIds = employeess.map(emp => emp._id.toString());

    if (employeeIds.length > 0) {
      filterQuery.employee = { $in: employeeIds.map(id => new ObjectId(id)) }
    }

    let start;
    let end;

    // ✅ Employee filter
    if (employeeId) {
      filterQuery.employee = new ObjectId(employeeId);
    }

    // ✅ Date logic
    if (date) {
      start = moment(date).startOf("day").toDate();
      end = moment(date).endOf("day").toDate();
    } else if (startDate && endDate) {
      start = moment(startDate).startOf("day").toDate();
      end = moment(endDate).endOf("day").toDate();
    } else {
      start = moment().startOf("day").toDate();
      end = moment().endOf("day").toDate();
    }

    filterQuery.date = {
      $gte: start,
      $lte: end,
    };

    // ✅ Attendance Data
    const attendance = await Attendance.find(filterQuery).lean();

    // ✅ Employees
    const employees = await employeeService.getEmployees(employeeMatchQuery);

    const totalEmployees = employeeId ? 1 : employees.length;

    // ✅ Approved Leaves
    const leaveQuery = {
      status: "APPROVED",
      startDate: { $lte: end },
      endDate: { $gte: start },
    };

    if (employeeId) {
      leaveQuery.employee = new ObjectId(employeeId);
    }

    const leaves = await Leave.find(leaveQuery).lean();

    // ✅ Leave Employee IDs
    const leaveEmployeeIds = new Set(
      leaves
        .filter((leave) => leave.leaveType === "FULL_DAY")
        .map((leave) => leave.employee.toString())
    );

    // ✅ Attendance Employee IDs
    const attendanceEmployeeIds = new Set(
      attendance.map((a) => a.employee.toString())
    );

    // ✅ Attendance Counts
    const presentCount = attendance.filter(
      (a) => a.status === "PRESENT"
    ).length;

    const attendanceAbsentCount = attendance.filter(
      (a) => a.status === "ABSENT"
    ).length;

    const halfDayCount = attendance.filter(
      (a) => a.attendanceStatus === "HALF_DAY"
    ).length;

    const shortLeaveCount = attendance.filter(
      (a) => a.attendanceStatus === "SHORT_LEAVE"
    ).length;

    const lateArrivals = attendance.filter((a) => a.isLate).length;

    // ✅ Leave Counts
    let fullDayLeave = 0;
    let halfDayLeave = 0;
    let shortLeave = 0;

    leaves.forEach((leave) => {
      if (leave.leaveType === "FULL_DAY") {
        fullDayLeave++;
      } else if (
        ["FIRST_HALF", "SECOND_HALF"].includes(leave.leaveType)
      ) {
        halfDayLeave++;
      } else if (
        ["FIRST_HALF_SHORT_LEAVE", "SECOND_HALF_SHORT_LEAVE"].includes(
          leave.leaveType
        )
      ) {
        shortLeave++;
      }
    });

    // ✅ Employees with NO attendance AND NOT on leave
    let missingAbsentCount = 0;

    employees.forEach((emp) => {
      const empId = emp._id.toString();

      const hasAttendance = attendanceEmployeeIds.has(empId);
      const isOnLeave = leaveEmployeeIds.has(empId);

      if (!hasAttendance && !isOnLeave) {
        missingAbsentCount++;
      }
    });

    // ✅ Final Absent Count
    const absentCount =
      attendanceAbsentCount + missingAbsentCount;

    const summary = {
      totalEmployees,

      present: presentCount,

      absent: absentCount,

      halfDay: halfDayCount + halfDayLeave,

      shortLeave: shortLeaveCount + shortLeave,

      onLeave: fullDayLeave,

      lateArrivals,
    };

    return summary;
  } catch (error) {
    throw new ApiError(
      httpStatus.status.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};
const getDepartmentDistribution = async ({ employeeId }, user) => {
  try {

    const matchQuery = {
      isActive: true,
    };

    if (user.role === 'CEO') {
      matchQuery._id = {
        $ne: new ObjectId(user.employeeId)
      };
    }

    if (user.role === 'MANAGER') {
      matchQuery["reportingTo"] = new ObjectId(user.employeeId)
    }



    const pipeline = [
      // ✅ Optional employee filter
      // ...(employeeId
      //   ? [{ $match: { _id: new ObjectId(employeeId) }, ...matchQuery }]
      //   : []),

      {
        $match: matchQuery
      },

      // ✅ Join department from employee.departmentId
      {
        $lookup: {
          from: "departments",
          localField: "department",
          foreignField: "_id",
          as: "department",
        },
      },

      // ✅ Handle missing department safely
      {
        $unwind: {
          path: "$department",
          preserveNullAndEmptyArrays: true,
        },
      },

      // ✅ Group by department name
      {
        $group: {
          _id: "$department.name",
          count: { $sum: 1 },
        },
      },

      // ✅ Calculate total employees
      {
        $group: {
          _id: null,
          total: { $sum: "$count" },
          departments: {
            $push: {
              name: { $ifNull: ["$_id", "Unknown"] },
              count: "$count",
            },
          },
        },
      },

      { $unwind: "$departments" },

      // ✅ Calculate %
      {
        $project: {
          _id: 0,
          name: "$departments.name",
          value: {
            $round: [
              {
                $multiply: [
                  {
                    $cond: [
                      { $eq: ["$total", 0] },
                      0,
                      { $divide: ["$departments.count", "$total"] },
                    ],
                  },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
    ];

    const departmentAgg = await Employee.aggregate(pipeline);

    // 🎨 Static colors
    const colorMap = {
      IT: "#4dd0e1",
      Sales: "#ff6b35",
      Finance: "#ffd93d",
      HR: "#a78bfa",
      Operations: "#fb923c",
      Unknown: "#999",
    };

    const departmentData = departmentAgg.map((d) => ({
      name: d.name,
      value: d.value,
      color: colorMap[d.name] || "#999",
    }));

    // ✅ Sort by highest %
    departmentData.sort((a, b) => b.value - a.value);

    return departmentData;
  } catch (error) {
    throw new ApiError(
      httpStatus.status.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const getAttendanceTrend = async ({
  employeeId,
  date,
  startDate,
  endDate,
}, user) => {
  try {
    let start;
    let end;

    // ✅ Date logic
    if (date) {
      start = moment(date).startOf("day");
      end = moment(date).endOf("day");
    } else if (startDate && endDate) {
      start = moment(startDate).startOf("day");
      end = moment(endDate).endOf("day");
    } else {
      // Default last 5 days
      start = moment().subtract(4, "days").startOf("day");
      end = moment().endOf("day");
    }

    // ✅ Attendance filter
    const attendanceMatch = {
      date: {
        $gte: start.toDate(),
        $lte: end.toDate(),
      },
    };

    const employeeMatchQuery = {
      isActive: true,
    };


    if (user.role === 'CEO') {
      employeeMatchQuery._id = {
        $ne: new ObjectId(user.employeeId)
      };
    }

    if (user.role === 'MANAGER') {
      employeeMatchQuery["reportingTo"] = new ObjectId(user.employeeId)
      // const employeeMatchQuery = {
      //   reportingTo: new ObjectId(user.employeeId)
      // }
      const employeess = await employeeService.getEmployees(employeeMatchQuery);
      const employeeIds = employeess.map(emp => emp._id.toString());
      attendanceMatch.employee = { $in: employeeIds.map(id => new ObjectId(id)) }
    }

    if (employeeId) {
      attendanceMatch.employee = new ObjectId(employeeId);
    }

    // ✅ Fetch attendance
    const attendance = await Attendance.find(attendanceMatch).lean();

    // ✅ Fetch approved leaves
    const leaveQuery = {
      status: "APPROVED",
      startDate: { $lte: end.toDate() },
      endDate: { $gte: start.toDate() },
    };

    if (employeeId) {
      leaveQuery.employee = new ObjectId(employeeId);
    }

    const leaves = await Leave.find(leaveQuery).lean();

    // ✅ Employees
    const employees = await employeeService.getEmployees(employeeMatchQuery);

    // ✅ Create all dates between range
    const dates = [];

    let current = moment(start);

    while (current.isSameOrBefore(end, "day")) {
      dates.push(current.format("YYYY-MM-DD"));
      current.add(1, "day");
    }

    const trendData = [];

    for (const day of dates) {
      const dayStart = moment(day).startOf("day");
      const dayEnd = moment(day).endOf("day");

      // ✅ Attendance for this day
      const dayAttendance = attendance.filter((a) =>
        moment(a.date).isBetween(dayStart, dayEnd, null, "[]")
      );

      // ✅ Leaves for this day
      const dayLeaves = leaves.filter(
        (leave) =>
          moment(leave.startDate).startOf("day") <= dayEnd &&
          moment(leave.endDate).endOf("day") >= dayStart
      );

      // ✅ Leave employee IDs
      const leaveEmployeeIds = new Set(
        dayLeaves
          .filter((l) => l.leaveType === "FULL_DAY")
          .map((l) => l.employee.toString())
      );

      // ✅ Attendance employee IDs
      const attendanceEmployeeIds = new Set(
        dayAttendance.map((a) => a.employee.toString())
      );

      // ✅ Counts
      const present = dayAttendance.filter(
        (a) => a.status === "PRESENT"
      ).length;

      const attendanceAbsent = dayAttendance.filter(
        (a) => a.attendanceStatus === "ABSENT"
      ).length;

      const halfDayAttendance = dayAttendance.filter(
        (a) => a.attendanceStatus === "HALF_DAY"
      ).length;

      const shortLeaveAttendance = dayAttendance.filter(
        (a) => a.attendanceStatus === "SHORT_LEAVE"
      ).length;

      const late = dayAttendance.filter((a) => a.isLate).length;

      // ✅ Leave counts
      const fullDayLeave = dayLeaves.filter(
        (l) => l.leaveType === "FULL_DAY"
      ).length;

      const halfDayLeave = dayLeaves.filter((l) =>
        ["FIRST_HALF", "SECOND_HALF"].includes(l.leaveType)
      ).length;

      const shortLeave = dayLeaves.filter((l) =>
        [
          "FIRST_HALF_SHORT_LEAVE",
          "SECOND_HALF_SHORT_LEAVE",
        ].includes(l.leaveType)
      ).length;

      // ✅ Missing attendance employees
      let missingAbsent = 0;

      employees.forEach((emp) => {
        const empId = emp._id.toString();

        const hasAttendance =
          attendanceEmployeeIds.has(empId);

        const isOnLeave =
          leaveEmployeeIds.has(empId);

        if (!hasAttendance && !isOnLeave) {
          missingAbsent++;
        }
      });

      const absent = attendanceAbsent + missingAbsent;

      trendData.push({
        date: dayStart.format("ddd"),

        present,

        absent,

        onLeave: fullDayLeave,

        halfDay: halfDayAttendance + halfDayLeave,

        shortLeave:
          shortLeaveAttendance + shortLeave,

        late,
      });
    }

    return trendData;
  } catch (error) {
    throw new ApiError(
      httpStatus.status.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

/**
 * Check if date is Weekly Off
 * Rules:
 * - Every Sunday
 * - 2nd Saturday
 * - 4th Saturday
 */
const isWeekOff = (date) => {
  const day = date.getDay();

  if (day === 0) {
    return true;
  }

  if (day === 6) {
    const saturdayNumber =
      Math.floor((date.getDate() - 1) / 7) + 1;

    return saturdayNumber === 2 || saturdayNumber === 4;
  }

  return false;
};

// // Constants
// const MAX_DATE_RANGE_DAYS = 365;
// const WEEKEND_DAYS = [0, 6]; // Sunday = 0, Saturday = 6

// const generateAttendanceReport = async (filterQuery, { startDate, endDate }) => {
//   const t0 = process.hrtime.bigint();
//   const mark = (label, from) => {
//     const ms = Number(process.hrtime.bigint() - from) / 1e6;
//     console.log(`[generateAttendanceReport] ${label}: ${ms.toFixed(1)}ms`);
//     return process.hrtime.bigint();
//   };

//   const today = new Date();
//   const todayEnd = new Date(today);
//   todayEnd.setHours(23, 59, 59, 999);

//   let fromDate;
//   let toDate;

//   // Parse dates properly without timezone issues
//   if (!startDate && !endDate) {
//     const now = new Date();
//     fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
//     toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
//   } else if (startDate && !endDate) {
//     const start = new Date(startDate);
//     fromDate = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
//     toDate = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
//   } else if (!startDate && endDate) {
//     const end = new Date(endDate);
//     fromDate = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);
//     toDate = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
//   } else {
//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     fromDate = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
//     toDate = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
//   }

//   // Validate dates
//   if (fromDate > toDate) {
//     throw new Error("Start date cannot be greater than end date");
//   }

//   if (fromDate > todayEnd) {
//     throw new Error("Cannot fetch report for future dates");
//   }

//   if (toDate > todayEnd) {
//     toDate = new Date(todayEnd);
//   }

//   const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
//   if (daysDiff > MAX_DATE_RANGE_DAYS) {
//     throw new Error(`Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`);
//   }

//   let t = mark("Date range resolution + validation", t0);

//   // Build all dates in the range
//   const allDates = [];
//   const currentDate = new Date(fromDate);
//   currentDate.setHours(0, 0, 0, 0);

//   while (currentDate <= toDate) {
//     const year = currentDate.getFullYear();
//     const month = String(currentDate.getMonth() + 1).padStart(2, '0');
//     const day = String(currentDate.getDate()).padStart(2, '0');
//     allDates.push(`${year}-${month}-${day}`);
//     currentDate.setDate(currentDate.getDate() + 1);
//   }

//   t = mark("Build allDates array", t);

//   // ---- GET EMPLOYEES ----
//   const employees = await Employee.find({ ...filterQuery, isActive: true })
//     .select("employeeCode fullName email department designation reportingTo joiningDate")
//     .populate([
//       { path: "department", select: "name" },
//       { path: "designation", select: "title" },
//       { path: "reportingTo", select: "fullName employeeCode" }
//     ])
//     .sort({ fullName: 1 })
//     .lean();

//   t = mark(`Employee.find + populate (${employees.length} employees)`, t);

//   if (!employees.length) {
//     mark("TOTAL (early return, no employees)", t0);
//     return { fromDate, toDate, totalEmployees: 0, totalDays: allDates.length, report: [] };
//   }

//   const employeeIds = employees.map(e => e._id);

//   // ---- LEAVES + ATTENDANCE IN PARALLEL ----
//   const parallelStart = process.hrtime.bigint();

//   const [approvedLeaves, attendanceRecords] = await Promise.all([
//     (async () => {
//       const s = process.hrtime.bigint();
//       const result = await Leave.find({
//         employee: { $in: employeeIds },
//         status: "APPROVED",
//         startDate: { $lte: toDate },
//         $or: [{ endDate: { $gte: fromDate } }, { endDate: null }]
//       })
//         .select("employee startDate endDate")
//         .lean();
//       const ms = Number(process.hrtime.bigint() - s) / 1e6;
//       console.log(`[generateAttendanceReport]   -> Leave.find (${result.length} docs): ${ms.toFixed(1)}ms`);
//       return result;
//     })(),

//     (async () => {
//       console.log(`[generateAttendanceReport]   -> Attendance.find (${employeeIds.length} employees, ${fromDate.toISOString()} to ${toDate.toISOString()})`);


//       // const s = process.hrtime.bigint();
//       console.log("came here")
//       const result = await Attendance.find({
//         employee: { $in: employeeIds },
//         date: { $gte: fromDate, $lte: toDate }
//       }).lean();
//       // console.log(`[generateAttendanceReport]   -> Attendance.find query executed, ${result.length} docs fetched`);
//       // const ms = Number(process.hrtime.bigint() - s) / 1e6;
//       // console.log(`[generateAttendanceReport]   -> Attendance.find (${result.length} docs): ${ms.toFixed(1)}ms`);
//       return result;
//     })()
//   ]);

//   t = mark("Leave + Attendance queries (parallel, wall time)", parallelStart);

//   // ---- BUILD LEAVE MAP ----
//   const leaveMap = {};
//   for (const leave of approvedLeaves) {
//     const employeeId = leave.employee.toString();
//     if (!leaveMap[employeeId]) leaveMap[employeeId] = new Set();

//     const start = new Date(leave.startDate);
//     const end = leave.endDate ? new Date(leave.endDate) : new Date(leave.startDate);

//     start.setHours(0, 0, 0, 0);
//     end.setHours(0, 0, 0, 0);

//     for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
//       const year = current.getFullYear();
//       const month = String(current.getMonth() + 1).padStart(2, '0');
//       const day = String(current.getDate()).padStart(2, '0');
//       leaveMap[employeeId].add(`${year}-${month}-${day}`);
//     }
//   }

//   t = mark("Build leaveMap", t);

//   // ---- BUILD ATTENDANCE MAP ----
//   const attendanceMap = {};
//   for (const attendance of attendanceRecords) {
//     const employeeId = attendance.employee.toString();

//     const dateObj = new Date(attendance.date);
//     const year = dateObj.getFullYear();
//     const month = String(dateObj.getMonth() + 1).padStart(2, '0');
//     const day = String(dateObj.getDate()).padStart(2, '0');
//     const dateKey = `${year}-${month}-${day}`;

//     if (!attendanceMap[employeeId]) attendanceMap[employeeId] = {};
//     attendanceMap[employeeId][dateKey] = attendance;
//   }

//   t = mark("Build attendanceMap", t);

//   // ---- BUILD REPORT ----
//   const report = [];
//   for (const employee of employees) {
//     const employeeId = employee._id.toString();
//     const attendance = [];

//     const joiningDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
//     if (joiningDate) joiningDate.setHours(0, 0, 0, 0);

//     const summary = {
//       present: 0, absent: 0, halfDay: 0, shortLeave: 0,
//       weekOff: 0, holiday: 0, onLeave: 0, notJoined: 0
//     };

//     for (const dateKey of allDates) {
//       const attendanceRecord = attendanceMap?.[employeeId]?.[dateKey];
//       let attendanceStatus;
//       let coreAttendanceStatus;

//       if (attendanceRecord) {
//         coreAttendanceStatus = attendanceRecord.coreAttendanceStatus ||
//           attendanceRecord.attendanceStatus ||
//           attendanceRecord.status;
//         attendanceStatus = coreAttendanceStatus;
//       } else {
//         const reportDate = new Date(dateKey);
//         reportDate.setHours(0, 0, 0, 0);
//         const isOnLeave = leaveMap?.[employeeId]?.has(dateKey);

//         if (joiningDate && reportDate < joiningDate) {
//           attendanceStatus = "NOT_JOINED";
//         } else if (isWeekOff(reportDate)) {
//           attendanceStatus = "WEEK_OFF";
//         } else if (isOnLeave) {
//           attendanceStatus = "ON_LEAVE";
//         } else {
//           attendanceStatus = "ABSENT";
//         }
//         coreAttendanceStatus = attendanceStatus;
//       }

//       const normalizedStatus = attendanceStatus ? attendanceStatus.toUpperCase().trim() : 'ABSENT';

//       // Count based on the status
//       if (normalizedStatus === 'PRESENT' ||
//         normalizedStatus === 'PRESENT(FULL_DAY)' ||
//         normalizedStatus === 'PRESENT_FULL_DAY' ||
//         normalizedStatus.includes('PRESENT')) {
//         summary.present++;
//       } else if (normalizedStatus === 'ABSENT') {
//         summary.absent++;
//       } else if (normalizedStatus === 'HALF_DAY' || normalizedStatus === 'HALFDAY') {
//         summary.halfDay++;
//       } else if (normalizedStatus === 'SHORT_LEAVE' || normalizedStatus === 'SHORTLEAVE') {
//         summary.shortLeave++;
//       } else if (normalizedStatus === 'WEEK_OFF') {
//         summary.weekOff++;
//       } else if (normalizedStatus === 'HOLIDAY') {
//         summary.holiday++;
//       } else if (normalizedStatus === 'ON_LEAVE') {
//         summary.onLeave++;
//       } else if (normalizedStatus === 'NOT_JOINED') {
//         summary.notJoined++;
//       } else {
//         if (normalizedStatus.includes('PRESENT')) {
//           summary.present++;
//         } else {
//           summary.absent++;
//         }
//       }

//       // Prepare attendance entry
//       const attendanceEntry = {
//         date: dateKey,
//         attendanceStatus: normalizedStatus,
//         coreAttendanceStatus: coreAttendanceStatus,
//         firstPunchIn: attendanceRecord?.firstPunchIn || null,
//         lastPunchOut: attendanceRecord?.lastPunchOut || null,
//         totalWorkingMinutes: attendanceRecord?.totalWorkingMinutes || 0,
//         totalBreakMinutes: attendanceRecord?.totalBreakMinutes || 0,
//         breakCount: attendanceRecord?.breakCount || 0,
//         isLate: attendanceRecord?.isLate || attendanceRecord?.coreIsLate || false,
//         lateMinutes: attendanceRecord?.lateMinutes || attendanceRecord?.coreLateMinutes || 0,
//         isHalfDay: attendanceRecord?.isHalfDay || attendanceRecord?.coreIsHalfDay || false,
//         halfDayType: attendanceRecord?.halfDayType || attendanceRecord?.coreHalfDayType || null,
//         remarks: attendanceRecord?.remarks || null
//       };

//       attendance.push(attendanceEntry);
//     }

//     report.push({
//       employeeId: employee._id,
//       employeeCode: employee.employeeCode,
//       fullName: employee.fullName,
//       email: employee.email,
//       department: employee.department,
//       designation: employee.designation,
//       reportingManager: employee.reportingTo,
//       joiningDate: employee.joiningDate,
//       summary,
//       attendance
//     });
//   }

//   // ============================================================
//   // SORT REPORT: Present > Short Leave > Half Day > Absent > Not Joined
//   // ============================================================
//   report.sort((a, b) => {
//     const getPriority = (emp) => {
//       const summary = emp.summary || {};

//       if (summary.present > 0) return 1;
//       if (summary.shortLeave > 0) return 2;
//       if (summary.halfDay > 0) return 3;
//       if (summary.absent > 0) return 4;
//       if (summary.notJoined > 0) return 5;
//       return 6;
//     };

//     const priorityA = getPriority(a);
//     const priorityB = getPriority(b);

//     if (priorityA !== priorityB) {
//       return priorityA - priorityB;
//     }

//     // If same priority, sort by present count descending
//     if (a.summary?.present !== b.summary?.present) {
//       return (b.summary?.present || 0) - (a.summary?.present || 0);
//     }

//     // Then by employee name
//     return (a.fullName || '').localeCompare(b.fullName || '');
//   });

//   mark(`Build report array (${employees.length} employees x ${allDates.length} days)`, t);
//   mark("TOTAL generateAttendanceReport", t0);

//   // Return dates in YYYY-MM-DD format for frontend
//   const fromDateStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`;
//   const toDateStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;

//   return {
//     fromDate: fromDateStr,
//     toDate: toDateStr,
//     totalEmployees: report.length,
//     totalDays: allDates.length,
//     report
//   };
// };




// Constants
const MAX_DATE_RANGE_DAYS = 365;
const WEEKEND_DAYS = [0, 6]; // Sunday = 0, Saturday = 6

const generateAttendanceReport = async (filterQuery, { startDate, endDate }) => {
  const t0 = process.hrtime.bigint();
  const mark = (label, from) => {
    const ms = Number(process.hrtime.bigint() - from) / 1e6;
    console.log(`[generateAttendanceReport] ${label}: ${ms.toFixed(1)}ms`);
    return process.hrtime.bigint();
  };

  const today = new Date();
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  let fromDate;
  let toDate;

  // Parse dates properly without timezone issues
  if (!startDate && !endDate) {
    const now = new Date();
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (startDate && !endDate) {
    const start = new Date(startDate);
    fromDate = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
    toDate = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (!startDate && endDate) {
    const end = new Date(endDate);
    fromDate = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);
    toDate = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  } else {
    const start = new Date(startDate);
    const end = new Date(endDate);
    fromDate = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
    toDate = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  }

  // Validate dates
  if (fromDate > toDate) {
    throw new Error("Start date cannot be greater than end date");
  }

  if (fromDate > todayEnd) {
    throw new Error("Cannot fetch report for future dates");
  }

  if (toDate > todayEnd) {
    toDate = new Date(todayEnd);
  }

  const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));
  if (daysDiff > MAX_DATE_RANGE_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`);
  }

  let t = mark("Date range resolution + validation", t0);

  // Build all dates in the range
  const allDates = [];
  const currentDate = new Date(fromDate);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate <= toDate) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    allDates.push(`${year}-${month}-${day}`);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  t = mark("Build allDates array", t);

  // ---- GET EMPLOYEES ----
  const employees = await Employee.find({ ...filterQuery, isActive: true })
    .select("employeeCode fullName email department designation reportingTo joiningDate")
    .populate([
      { path: "department", select: "name" },
      { path: "designation", select: "title" },
      { path: "reportingTo", select: "fullName employeeCode" }
    ])
    .sort({ fullName: 1 })
    .lean();

  t = mark(`Employee.find + populate (${employees.length} employees)`, t);

  if (!employees.length) {
    mark("TOTAL (early return, no employees)", t0);
    return { fromDate, toDate, totalEmployees: 0, totalDays: allDates.length, report: [] };
  }

  const employeeIds = employees.map(e => e._id);

  // ---- LEAVES + ATTENDANCE IN PARALLEL WITH OPTIMIZED PROJECTIONS ----
  const parallelStart = process.hrtime.bigint();

  const [approvedLeaves, attendanceRecords] = await Promise.all([
    (async () => {
      const s = process.hrtime.bigint();
      const result = await Leave.find({
        employee: { $in: employeeIds },
        status: "APPROVED",
        startDate: { $lte: toDate },
        $or: [{ endDate: { $gte: fromDate } }, { endDate: null }]
      })
        .select("employee startDate endDate")
        .lean()
        .maxTimeMS(30000);
      const ms = Number(process.hrtime.bigint() - s) / 1e6;
      console.log(`[generateAttendanceReport]   -> Leave.find (${result.length} docs): ${ms.toFixed(1)}ms`);
      return result;
    })(),

    (async () => {
      console.log(`[generateAttendanceReport]   -> Attendance.find (${employeeIds.length} employees, ${fromDate.toISOString()} to ${toDate.toISOString()})`);
      const s = process.hrtime.bigint();

      // FIXED: Use only inclusion projection (no mixing with exclusion)
      const result = await Attendance.find({
        employee: { $in: employeeIds },
        date: { $gte: fromDate, $lte: toDate }
      })
        .select({
          employee: 1,
          date: 1,
          coreAttendanceStatus: 1,
          attendanceStatus: 1,
          status: 1,
          firstPunchIn: 1,
          lastPunchOut: 1,
          totalWorkingMinutes: 1,
          totalBreakMinutes: 1,
          breakCount: 1,
          isLate: 1,
          coreIsLate: 1,
          lateMinutes: 1,
          coreLateMinutes: 1,
          isHalfDay: 1,
          coreIsHalfDay: 1,
          halfDayType: 1,
          coreHalfDayType: 1
          // Note: remarks is intentionally excluded by not including it
          // sessions and other large fields are also excluded
        })
        .lean()
        .maxTimeMS(60000);

      const ms = Number(process.hrtime.bigint() - s) / 1e6;
      console.log(`[generateAttendanceReport]   -> Attendance.find (${result.length} docs): ${ms.toFixed(1)}ms`);
      return result;
    })()
  ]);

  t = mark("Leave + Attendance queries (parallel, wall time)", parallelStart);

  // ---- BUILD LEAVE MAP WITH OPTIMIZED LOOP ----
  const leaveMap = {};
  for (const leave of approvedLeaves) {
    const employeeId = leave.employee.toString();
    if (!leaveMap[employeeId]) leaveMap[employeeId] = new Set();

    const start = new Date(leave.startDate);
    const end = leave.endDate ? new Date(leave.endDate) : new Date(leave.startDate);

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      leaveMap[employeeId].add(`${year}-${month}-${day}`);
    }
  }

  t = mark("Build leaveMap", t);

  // ---- BUILD ATTENDANCE MAP WITH OPTIMIZED LOOP ----
  const attendanceMap = {};
  for (const attendance of attendanceRecords) {
    const employeeId = attendance.employee.toString();

    const dateObj = new Date(attendance.date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;

    if (!attendanceMap[employeeId]) attendanceMap[employeeId] = {};
    attendanceMap[employeeId][dateKey] = attendance;
  }

  t = mark("Build attendanceMap", t);

  // ---- BUILD REPORT WITH OPTIMIZED STATUS CHECKING ----
  const STATUS_PRESENT = ['PRESENT', 'PRESENT(FULL_DAY)', 'PRESENT_FULL_DAY'];
  const STATUS_HALF_DAY = ['HALF_DAY', 'HALFDAY'];
  const STATUS_SHORT_LEAVE = ['SHORT_LEAVE', 'SHORTLEAVE'];

  const report = [];
  for (const employee of employees) {
    const employeeId = employee._id.toString();
    const attendance = [];

    const joiningDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
    if (joiningDate) joiningDate.setHours(0, 0, 0, 0);

    const summary = {
      present: 0, absent: 0, halfDay: 0, shortLeave: 0,
      weekOff: 0, holiday: 0, onLeave: 0, notJoined: 0
    };

    const employeeAttendanceMap = attendanceMap[employeeId] || {};
    const employeeLeaveSet = leaveMap[employeeId] || new Set();

    for (const dateKey of allDates) {
      const attendanceRecord = employeeAttendanceMap[dateKey];
      let attendanceStatus;
      let coreAttendanceStatus;

      if (attendanceRecord) {
        coreAttendanceStatus = attendanceRecord.coreAttendanceStatus ||
          attendanceRecord.attendanceStatus ||
          attendanceRecord.status ||
          "ABSENT";
        attendanceStatus = coreAttendanceStatus;
      } else {
        const reportDate = new Date(dateKey);
        reportDate.setHours(0, 0, 0, 0);
        const isOnLeave = employeeLeaveSet.has(dateKey);

        if (joiningDate && reportDate < joiningDate) {
          attendanceStatus = "NOT_JOINED";
        } else if (isWeekOff(reportDate)) {
          attendanceStatus = "WEEK_OFF";
        } else if (isOnLeave) {
          attendanceStatus = "ON_LEAVE";
        } else {
          attendanceStatus = "ABSENT";
        }
        coreAttendanceStatus = attendanceStatus;
      }

      const normalizedStatus = attendanceStatus ? attendanceStatus.toUpperCase().trim() : 'ABSENT';

      // Count based on the status using pre-defined sets
      if (normalizedStatus === 'ABSENT') {
        summary.absent++;
      } else if (STATUS_HALF_DAY.includes(normalizedStatus)) {
        summary.halfDay++;
      } else if (STATUS_SHORT_LEAVE.includes(normalizedStatus)) {
        summary.shortLeave++;
      } else if (normalizedStatus === 'WEEK_OFF') {
        summary.weekOff++;
      } else if (normalizedStatus === 'HOLIDAY') {
        summary.holiday++;
      } else if (normalizedStatus === 'ON_LEAVE') {
        summary.onLeave++;
      } else if (normalizedStatus === 'NOT_JOINED') {
        summary.notJoined++;
      } else if (STATUS_PRESENT.includes(normalizedStatus) || normalizedStatus.includes('PRESENT')) {
        summary.present++;
      } else {
        summary.absent++;
      }

      // Prepare attendance entry - remarks EXCLUDED
      const attendanceEntry = {
        date: dateKey,
        attendanceStatus: normalizedStatus,
        coreAttendanceStatus: coreAttendanceStatus,
        firstPunchIn: attendanceRecord?.firstPunchIn || null,
        lastPunchOut: attendanceRecord?.lastPunchOut || null,
        totalWorkingMinutes: attendanceRecord?.totalWorkingMinutes || 0,
        totalBreakMinutes: attendanceRecord?.totalBreakMinutes || 0,
        breakCount: attendanceRecord?.breakCount || 0,
        isLate: attendanceRecord?.isLate || attendanceRecord?.coreIsLate || false,
        lateMinutes: attendanceRecord?.lateMinutes || attendanceRecord?.coreLateMinutes || 0,
        isHalfDay: attendanceRecord?.isHalfDay || attendanceRecord?.coreIsHalfDay || false,
        halfDayType: attendanceRecord?.halfDayType || attendanceRecord?.coreHalfDayType || null
        // remarks: EXCLUDED to reduce payload size
      };

      attendance.push(attendanceEntry);
    }

    report.push({
      employeeId: employee._id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: employee.email,
      department: employee.department,
      designation: employee.designation,
      reportingManager: employee.reportingTo,
      joiningDate: employee.joiningDate,
      summary,
      attendance
    });
  }

  // ============================================================
  // SORT REPORT: Present > Short Leave > Half Day > Absent > Not Joined
  // ============================================================
  report.sort((a, b) => {
    const getPriority = (emp) => {
      const summary = emp.summary || {};

      if (summary.present > 0) return 1;
      if (summary.shortLeave > 0) return 2;
      if (summary.halfDay > 0) return 3;
      if (summary.absent > 0) return 4;
      if (summary.notJoined > 0) return 5;
      return 6;
    };

    const priorityA = getPriority(a);
    const priorityB = getPriority(b);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    if (a.summary?.present !== b.summary?.present) {
      return (b.summary?.present || 0) - (a.summary?.present || 0);
    }

    return (a.fullName || '').localeCompare(b.fullName || '');
  });

  mark(`Build report array (${employees.length} employees x ${allDates.length} days)`, t);
  mark("TOTAL generateAttendanceReport", t0);

  // Return dates in YYYY-MM-DD format for frontend
  const fromDateStr = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`;
  const toDateStr = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;

  return {
    fromDate: fromDateStr,
    toDate: toDateStr,
    totalEmployees: report.length,
    totalDays: allDates.length,
    report
  };
};


const generateReportForEmployees = async (
  employees,
  employeeIds,
  totalEmployeeCount,
  fromDate,
  toDate,
  allDates,
  dateMeta,
  t,
  t0
) => {
  t = mark(`Employee query (${employees.length} employees)`, t);

  /* ================================
     OPTIMIZED LEAVES + ATTENDANCE QUERIES
  ================================ */
  const parallelStart = process.hrtime.bigint();

  const [approvedLeaves, attendanceRecords] = await Promise.all([
    // Leave Query
    (async () => {
      console.time('Leave Query');
      const s = process.hrtime.bigint();

      try {
        const result = await Leave.find({
          employee: { $in: employeeIds },
          status: 'APPROVED',
          startDate: { $lte: toDate },
          $or: [
            { endDate: { $gte: fromDate } },
            { endDate: null }
          ]
        })
          .select('employee startDate endDate')
          .lean()
          .maxTimeMS(5000);

        console.timeEnd('Leave Query');
        const ms = Number(process.hrtime.bigint() - s) / 1e6;
        console.log(`[generateAttendanceReport]   -> Leave.find (${result.length} docs): ${ms.toFixed(1)}ms`);
        return result;
      } catch (error) {
        console.error('Leave Query failed:', error);
        console.timeEnd('Leave Query');
        throw error;
      }
    })(),

    // Attendance Query - Using native driver (FIXED)
    (async () => {
      return await getAttendanceNative(employeeIds, fromDate, toDate);
    })()
  ]);

  t = mark('Leave + Attendance queries (parallel, wall time)', parallelStart);

  /* ================================
     BUILD MAPS
  ================================ */
  const leaveMap = buildLeaveMap(approvedLeaves);
  t = mark('Build leaveMap', t);

  const attendanceMap = buildAttendanceMap(attendanceRecords);
  t = mark('Build attendanceMap', t);

  /* ================================
     BUILD REPORT
  ================================ */
  const report = [];

  for (const employee of employees) {
    const employeeId = employee._id.toString();
    const empAttendance = attendanceMap.get(employeeId);
    const empLeaveDays = leaveMap.get(employeeId);

    let joiningTimestamp = null;
    if (employee.joiningDate) {
      const joiningDate = new Date(employee.joiningDate);
      joiningDate.setHours(0, 0, 0, 0);
      joiningTimestamp = joiningDate.getTime();
    }

    const summary = {
      present: 0, absent: 0, halfDay: 0, shortLeave: 0,
      weekOff: 0, holiday: 0, onLeave: 0, notJoined: 0,
    };

    const attendance = new Array(dateMeta.length);

    for (let i = 0; i < dateMeta.length; i++) {
      const { dateKey, timestamp, isWeekOff: weekOffFlag } = dateMeta[i];
      const attendanceRecord = empAttendance ? empAttendance.get(dateKey) : undefined;
      let attendanceStatus;
      let coreAttendanceStatus;

      if (attendanceRecord) {
        coreAttendanceStatus = attendanceRecord.coreAttendanceStatus ||
          attendanceRecord.attendanceStatus ||
          attendanceRecord.status;
        attendanceStatus = coreAttendanceStatus;
      } else {
        const isOnLeave = empLeaveDays ? empLeaveDays.has(dateKey) : false;

        if (joiningTimestamp !== null && timestamp < joiningTimestamp) {
          attendanceStatus = 'NOT_JOINED';
        } else if (weekOffFlag) {
          attendanceStatus = 'WEEK_OFF';
        } else if (isOnLeave) {
          attendanceStatus = 'ON_LEAVE';
        } else {
          attendanceStatus = 'ABSENT';
        }
        coreAttendanceStatus = attendanceStatus;
      }

      const normalizedStatus = attendanceStatus ? attendanceStatus.toUpperCase().trim() : 'ABSENT';

      let summaryKey;
      if (normalizedStatus.includes('PRESENT')) {
        summaryKey = 'present';
      } else {
        summaryKey = STATUS_EXACT_MAP[normalizedStatus] || 'absent';
      }
      summary[summaryKey]++;

      attendance[i] = {
        date: dateKey,
        attendanceStatus: normalizedStatus,
        coreAttendanceStatus,
        firstPunchIn: attendanceRecord?.firstPunchIn || null,
        lastPunchOut: attendanceRecord?.lastPunchOut || null,
        totalWorkingMinutes: attendanceRecord?.totalWorkingMinutes || 0,
        totalBreakMinutes: attendanceRecord?.totalBreakMinutes || 0,
        breakCount: attendanceRecord?.breakCount || 0,
        isLate: attendanceRecord?.isLate || attendanceRecord?.coreIsLate || false,
        lateMinutes: attendanceRecord?.lateMinutes || attendanceRecord?.coreLateMinutes || 0,
        isHalfDay: attendanceRecord?.isHalfDay || attendanceRecord?.coreIsHalfDay || false,
        halfDayType: attendanceRecord?.halfDayType || attendanceRecord?.coreHalfDayType || null,
        remarks: attendanceRecord?.remarks || null,
      };
    }

    report.push({
      employeeId: employee._id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: employee.email,
      department: employee.department,
      designation: employee.designation,
      reportingManager: employee.reportingTo,
      joiningDate: employee.joiningDate,
      summary,
      attendance,
    });
  }

  /* ================================
     SORT REPORT
  ================================ */
  report.sort((a, b) => {
    const getPriority = (emp) => {
      const summary = emp.summary || {};
      if (summary.present > 0) return 1;
      if (summary.shortLeave > 0) return 2;
      if (summary.halfDay > 0) return 3;
      if (summary.absent > 0) return 4;
      if (summary.notJoined > 0) return 5;
      return 6;
    };

    const priorityA = getPriority(a);
    const priorityB = getPriority(b);
    if (priorityA !== priorityB) return priorityA - priorityB;

    if (a.summary?.present !== b.summary?.present) {
      return (b.summary?.present || 0) - (a.summary?.present || 0);
    }

    return (a.fullName || '').localeCompare(b.fullName || '');
  });

  t = mark(`Build report array (${employees.length} employees x ${allDates.length} days)`, t);
  mark('TOTAL generateAttendanceReport', t0);

  const fromDateStr = formatDateKey(fromDate);
  const toDateStr = formatDateKey(toDate);

  return {
    fromDate: fromDateStr,
    toDate: toDateStr,
    totalEmployees: report.length,
    totalCount: totalEmployeeCount,
    totalDays: allDates.length,
    report,
  };
};






const getPreviousMonthsBalances = async (employeeId, leaveTypeId, currentMonth, currentYear, maxMonths = 12, session = null) => {
  const previousBalances = [];

  for (let i = 1; i <= maxMonths; i++) {
    let prevMonth = currentMonth - i;
    let prevYear = currentYear;

    if (prevMonth <= 0) {
      prevMonth += 12;
      prevYear -= 1;
    }

    if (prevYear < currentYear) {
      continue;
    }

    const balance = await LeaveBalance.findOne({
      employeeId: employeeId,
      leaveTypeId: leaveTypeId,
      month: prevMonth,
      year: prevYear
    }).session(session);

    if (balance && (balance.used > 0 || balance.lop > 0)) {
      previousBalances.push({
        balance: balance,
        month: prevMonth,
        year: prevYear,
        used: balance.used || 0,
        lop: balance.lop || 0,
        remaining: balance.remaining || 0
      });
    }
  }

  previousBalances.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  return previousBalances;
};

// Check if date is within leave range
const isDateInLeaveRange = (date, leave) => {
  if (!leave) return false;

  const checkDateStr = moment(date).utc().format('YYYY-MM-DD');
  const fromDateStr = moment(leave.startDate).utc().format('YYYY-MM-DD');

  if (!leave.endDate) {
    return checkDateStr === fromDateStr;
  }

  const toDateStr = moment(leave.endDate).utc().format('YYYY-MM-DD');
  return checkDateStr >= fromDateStr && checkDateStr <= toDateStr;
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

// REQUEST REGULARIZATION
const requestRegularization = async (data) => {
  console.log("Requesting regularization with data:", data);
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const {
      attendanceId,
      employeeId,
      requestType,
      attendanceDate,
      requestedPunchIn,
      requestedPunchOut,
      reason,
      requestedBy
    } = data;

    // Validate attendance exists
    const attendance = await Attendance.findById(attendanceId)
      .populate("employee")
      .session(dbSession);

    if (!attendance) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: "Attendance record not found"
      };
    }

    // Check if employee has permission to request regularization for this attendance
    if (attendance.employee._id.toString() !== employeeId.toString()) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: "You can only request regularization for your own attendance"
      };
    }

    // Check if already has pending request
    const existingRequest = await AttendanceRegularization.findOne({
      attendanceId,
      status: { $in: ["PENDING", "APPROVED"] }
    }).session(dbSession);

    console.log("Existing request check:", existingRequest);
    if (existingRequest) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: `A ${existingRequest.status.toLowerCase()} regularization request already exists for this attendance`
      };
    }

    // Validate request type specific requirements
    if (requestType === "MISSING_PUNCH_IN" && !requestedPunchIn) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: "Requested punch-in time is required for MISSING_PUNCH_IN request"
      };
    }

    if (requestType === "MISSING_PUNCH_OUT" && !requestedPunchOut) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: "Requested punch-out time is required for MISSING_PUNCH_OUT request"
      };
    }

    if (requestType === "MISSING_BOTH" && (!requestedPunchIn || !requestedPunchOut)) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: "Both punch-in and punch-out times are required for MISSING_BOTH request"
      };
    }

    // Create regularization request
    const regularization = new AttendanceRegularization({
      employeeId,
      attendanceId,
      requestType,
      attendanceDate,
      requestedPunchIn: requestedPunchIn || null,
      requestedPunchOut: requestedPunchOut || null,
      reason,
      status: "PENDING",
      requestedBy: requestedBy || employeeId
    });

    await regularization.save({ session: dbSession });

    await dbSession.commitTransaction();
    dbSession.endSession();

    return {
      success: true,
      message: "Regularization request submitted successfully",
      data: regularization
    };

  } catch (error) {
    await dbSession.abortTransaction();
    dbSession.endSession();
    console.error("Error in requestRegularization:", error);
    throw error;
  }
};

// GET REGULARIZATION REQUESTS
const getRegularizationRequests = async (filters = {}) => {
  try {
    const {
      user,
      status,
      employeeId,
      requestType,
      startDate,
      endDate,
      page = 1,
      limit = 10
    } = filters;

    const query = {};


    // const employeeMatchQuery = {};
    if (user.role == 'MANAGER') {
      query["reportingTo"] = new ObjectId(user.employeeId)
    }

    if (status) query.status = status;
    if (employeeId) query.employeeId = employeeId;
    if (requestType) query.requestType = requestType;

    if (startDate || endDate) {
      query.attendanceDate = {};
      if (startDate) query.attendanceDate.$gte = new Date(startDate);
      if (endDate) query.attendanceDate.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    console.log(query);
    const [requests, totalCount] = await Promise.all([
      AttendanceRegularization.find(query)
        .populate('employeeId', 'fullName employeeCode email department')
        .populate('attendanceId')
        .populate('approvedBy', 'fullName employeeCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AttendanceRegularization.countDocuments(query)
    ]);

    return {
      success: true,
      data: requests,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    };

  } catch (error) {
    console.error("Error in getRegularizationRequests:", error);
    throw error;
  }
};

// GET REGULARIZATION BY ID
const getRegularizationById = async (regularizationId, userId, userRole) => {
  try {
    const regularization = await AttendanceRegularization.findById(regularizationId)
      .populate('employeeId', 'fullName employeeCode email department')
      .populate('attendanceId')
      .populate('approvedBy', 'fullName employeeCode')
      .lean();

    if (!regularization) {
      return {
        success: false,
        message: "Regularization request not found"
      };
    }

    // Check permission - only admin/HR or the employee themselves can view
    if (userRole !== 'ADMIN' && userRole !== 'HR' &&
      regularization.employeeId._id.toString() !== userId.toString()) {
      return {
        success: false,
        message: "You don't have permission to view this request"
      };
    }

    return {
      success: true,
      data: regularization
    };

  } catch (error) {
    console.error("Error in getRegularizationById:", error);
    throw error;
  }
};

// ============================================================================
// HELPER FUNCTION: GET PREVIOUS MONTHS EL BALANCES
// ============================================================================
const getPreviousMonthsELBalances = async (employeeId, leaveTypeId, currentMonth, currentYear, maxMonths = 12, session = null) => {
  const previousBalances = [];

  for (let i = 1; i <= maxMonths; i++) {
    let prevMonth = currentMonth - i;
    let prevYear = currentYear;

    if (prevMonth <= 0) {
      prevMonth += 12;
      prevYear -= 1;
    }

    // Skip if previous year (only current year)
    if (prevYear < currentYear) {
      continue;
    }

    const balance = await LeaveBalance.findOne({
      employeeId: employeeId,
      leaveTypeId: leaveTypeId,
      month: prevMonth,
      year: prevYear
    }).session(session);

    if (balance && (balance.used > 0 || balance.lop > 0 || balance.remaining > 0)) {
      previousBalances.push({
        balance: balance,
        month: prevMonth,
        year: prevYear,
        used: balance.used || 0,
        lop: balance.lop || 0,
        remaining: balance.remaining || 0
      });
    }
  }

  // Sort by month (most recent first)
  previousBalances.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  return previousBalances;
};

// ============================================================================
// HELPER FUNCTION: ADD LEAVE BALANCE BACK
// ============================================================================
const addLeaveBalanceBack = async (employeeId, date, session = null) => {
  try {
    // Get EL leave type
    const leaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(session);
    if (!leaveTypeDoc) {
      return {
        success: false,
        message: "Leave type 'EL' not found"
      };
    }

    const month = moment(date).month() + 1;
    const year = moment(date).year();

    let totalAddedBack = 0;
    let addedFromMonth = null;
    let addedFromYear = null;
    let additionDetails = {
      currentMonth: { added: 0, from: "used" },
      previousMonths: []
    };

    // STEP 1: Check current month's balance
    let balance = await LeaveBalance.findOne({
      employeeId: employeeId,
      leaveTypeId: leaveTypeDoc._id,
      month,
      year
    }).session(session);

    if (balance) {
      const used = balance.used || 0;
      const lop = balance.lop || 0;

      // Try to add back from current month
      if (lop > 0) {
        // Reduce LOP first
        balance.lop = Math.max(0, lop - 1);
        totalAddedBack += 1;
        addedFromMonth = month;
        addedFromYear = year;
        additionDetails.currentMonth.added = 1;
        additionDetails.currentMonth.from = "lop";
        console.log(`  ✅ Added back 1 day from LOP (remaining LOP: ${balance.lop})`);
      } else if (used > 0) {
        // Reduce used leave
        balance.used = Math.max(0, used - 1);
        balance.remaining = (balance.total || 0) - balance.used;
        totalAddedBack += 1;
        addedFromMonth = month;
        addedFromYear = year;
        additionDetails.currentMonth.added = 1;
        additionDetails.currentMonth.from = "used";
        console.log(`  ✅ Added back 1 day from used leave (remaining used: ${balance.used})`);
      }

      if (totalAddedBack > 0) {
        await balance.save({ session });
      }
    }

    // STEP 2: If current month didn't have leave to add back, check previous months
    if (totalAddedBack === 0) {
      console.log(`  ℹ️ No leave to add back in current month. Checking previous months...`);

      const previousMonths = await getPreviousMonthsELBalances(
        employeeId,
        leaveTypeDoc._id,
        month,
        year,
        12,
        session
      );

      for (const prevMonth of previousMonths) {
        if (totalAddedBack >= 1) break;

        const prevBalance = prevMonth.balance;
        const prevUsed = prevBalance.used || 0;
        const prevLop = prevBalance.lop || 0;

        if (prevLop > 0) {
          // Reduce LOP first
          prevBalance.lop = Math.max(0, prevLop - 1);
          totalAddedBack += 1;
          addedFromMonth = prevMonth.month;
          addedFromYear = prevMonth.year;
          additionDetails.previousMonths.push({
            month: prevMonth.month,
            year: prevMonth.year,
            added: 1,
            from: "lop"
          });
          console.log(`  ✅ Added back 1 day from LOP of ${prevMonth.month}/${prevMonth.year}`);
          await prevBalance.save({ session });
        } else if (prevUsed > 0) {
          // Reduce used leave
          prevBalance.used = Math.max(0, prevUsed - 1);
          prevBalance.remaining = (prevBalance.total || 0) - prevBalance.used;
          totalAddedBack += 1;
          addedFromMonth = prevMonth.month;
          addedFromYear = prevMonth.year;
          additionDetails.previousMonths.push({
            month: prevMonth.month,
            year: prevMonth.year,
            added: 1,
            from: "used"
          });
          console.log(`  ✅ Added back 1 day from used leave of ${prevMonth.month}/${prevMonth.year}`);
          await prevBalance.save({ session });
        }
      }
    }

    if (totalAddedBack === 0) {
      console.log(`  ℹ️ No leave deduction found to add back.`);
      return {
        success: true,
        message: "No leave balance to add back",
        totalAddedBack: 0,
        addedFromMonth: null,
        addedFromYear: null,
        additionDetails
      };
    }

    return {
      success: true,
      message: `Added back ${totalAddedBack} day(s) of leave`,
      totalAddedBack,
      addedFromMonth,
      addedFromYear,
      additionDetails
    };

  } catch (error) {
    console.error("Error in addLeaveBalanceBack:", error);
    return {
      success: false,
      message: error.message
    };
  }
};

// ============================================================================
// DEDUCT LEAVE BALANCE FOR A SPECIFIC DATE (FULL DAY)
// ============================================================================
const deductLeaveBalanceForDate = async (employeeId, date, leaveTypeCode = "EL", session = null) => {
  try {
    const leaveTypeDoc = await LeaveType.findOne({ code: leaveTypeCode }).session(session);
    if (!leaveTypeDoc) {
      console.log(`  ⚠️ Leave type "${leaveTypeCode}" not found. Skipping leave deduction.`);
      return { success: false, message: "Leave type not found" };
    }

    const month = moment(date).month() + 1;
    const year = moment(date).year();
    const dayOfMonth = moment(date).date();

    let balance = await LeaveBalance.findOne({
      employeeId: employeeId,
      leaveTypeId: leaveTypeDoc._id,
      month,
      year,
    }).session(session);

    console.log(`  ℹ️ Current month: ${month}/${year}`);
    console.log(`  ℹ️ Current leave balance: ${balance ? balance.remaining : 0} days`);

    if (!balance) {
      balance = new LeaveBalance({
        employeeId: employeeId,
        leaveTypeId: leaveTypeDoc._id,
        month,
        year,
        total: 0,
        used: 0,
        remaining: 0,
        lop: 0,
        deductedDays: [],
      });
      console.log(`  ℹ️ No leave balance found. Created new balance with 0 remaining.`);
    }

    if (balance.deductedDays && balance.deductedDays.includes(dayOfMonth)) {
      console.log(`  ℹ️ Day ${dayOfMonth} already deducted for ${month}/${year}. Skipping deduction.`);
      return {
        success: true,
        alreadyDeducted: true,
        balance,
        used: balance.used,
        remaining: balance.remaining,
        lop: balance.lop || 0,
        message: `Day ${dayOfMonth} already deducted`
      };
    }

    let amountToDeduct = 1;
    let remainingToDeduct = amountToDeduct;
    let totalDeducted = 0;

    if (balance.remaining >= remainingToDeduct) {
      console.log(`  ℹ️ Current month balance sufficient. Deducting ${remainingToDeduct} day from current month.`);
      balance.used += remainingToDeduct;
      balance.remaining -= remainingToDeduct;
      totalDeducted += remainingToDeduct;
      remainingToDeduct = 0;
      console.log(`  ✅ Used ${remainingToDeduct} day from current month (remaining: ${balance.remaining})`);
    } else if (balance.remaining > 0) {
      console.log(`  ℹ️ Current month balance insufficient. Using available ${balance.remaining} day from current month.`);
      const available = balance.remaining;
      balance.used += available;
      balance.remaining = 0;
      totalDeducted += available;
      remainingToDeduct -= available;
      console.log(`  ✅ Used ${available} day from current month (remaining: 0)`);
    }

    if (remainingToDeduct > 0) {
      console.log(`  ℹ️ Current month balance insufficient. Checking previous months...`);

      const previousBalances = await getPreviousMonthsELBalances(
        employeeId,
        leaveTypeDoc._id,
        month,
        year,
        12,
        session
      );

      for (const prevBalance of previousBalances) {
        if (remainingToDeduct <= 0) break;

        const availableFromPrev = Math.min(prevBalance.remaining, remainingToDeduct);

        if (availableFromPrev > 0) {
          prevBalance.balance.used += availableFromPrev;
          prevBalance.balance.remaining -= availableFromPrev;
          totalDeducted += availableFromPrev;
          remainingToDeduct -= availableFromPrev;

          console.log(`  ✅ Used ${availableFromPrev} day from ${prevBalance.month}/${prevBalance.year} (remaining: ${prevBalance.balance.remaining})`);
          await prevBalance.balance.save({ session });
        }
      }
    }

    if (remainingToDeduct > 0) {
      console.log(`  ⚠️ No sufficient EL balance in current or previous months. Converting ${remainingToDeduct} day(s) to LOP.`);
      balance.lop = (balance.lop || 0) + remainingToDeduct;
      totalDeducted += remainingToDeduct;
      console.log(`  ⚠️ LOP: ${remainingToDeduct} days (no EL balance in current or previous months)`);
    }

    balance.deductedDays = balance.deductedDays || [];
    if (!balance.deductedDays.includes(dayOfMonth)) {
      balance.deductedDays.push(dayOfMonth);
    }

    await balance.save({ session });

    console.log(`  ✅ Leave balance updated: used=${balance.used}, remaining=${balance.remaining}, lop=${balance.lop || 0}, deductedDays=${balance.deductedDays}`);

    return {
      success: true,
      balance,
      used: balance.used,
      remaining: balance.remaining,
      lop: balance.lop || 0,
      deductedFromPreviousMonths: totalDeducted - (amountToDeduct - remainingToDeduct - (balance.lop || 0))
    };

  } catch (error) {
    console.error(`  ❌ Error deducting leave balance:`, error.message);
    return { success: false, message: error.message };
  }
};

// ============================================================================
// DEDUCT HALF DAY LEAVE BALANCE (0.5 day)
// ============================================================================
const deductHalfDayLeaveBalance = async (employeeId, date, halfDayType, leaveTypeCode = "EL", session = null) => {
  try {
    console.log(`  ℹ️ Processing HALF DAY deduction (${halfDayType}) for ${moment(date).format('YYYY-MM-DD')}`);

    const leaveTypeDoc = await LeaveType.findOne({ code: leaveTypeCode }).session(session);
    if (!leaveTypeDoc) {
      console.log(`  ⚠️ Leave type "${leaveTypeCode}" not found. Skipping half-day deduction.`);
      return { success: false, message: "Leave type not found" };
    }

    const month = moment(date).month() + 1;
    const year = moment(date).year();
    const dayOfMonth = moment(date).date();

    let balance = await LeaveBalance.findOne({
      employeeId: employeeId,
      leaveTypeId: leaveTypeDoc._id,
      month,
      year,
    }).session(session);

    if (!balance) {
      balance = new LeaveBalance({
        employeeId: employeeId,
        leaveTypeId: leaveTypeDoc._id,
        month,
        year,
        total: 0,
        used: 0,
        remaining: 0,
        lop: 0,
        deductedDays: [],
      });
      console.log(`  ℹ️ No leave balance found. Created new balance with 0 remaining.`);
    }

    if (balance.deductedDays && balance.deductedDays.includes(dayOfMonth)) {
      console.log(`  ℹ️ Day ${dayOfMonth} already deducted for ${month}/${year}. Skipping half-day deduction.`);
      return {
        success: true,
        alreadyDeducted: true,
        balance,
        used: balance.used,
        remaining: balance.remaining,
        lop: balance.lop || 0,
        halfDayType,
        message: `Day ${dayOfMonth} already deducted`
      };
    }

    const amountToDeduct = 0.5;
    let remainingToDeduct = amountToDeduct;
    let totalDeducted = 0;

    if (balance.remaining >= remainingToDeduct) {
      balance.used += remainingToDeduct;
      balance.remaining -= remainingToDeduct;
      totalDeducted += remainingToDeduct;
      remainingToDeduct = 0;
      console.log(`  ✅ Used ${remainingToDeduct} day (half day) from current month (remaining: ${balance.remaining})`);
    } else if (balance.remaining > 0) {
      const available = balance.remaining;
      balance.used += available;
      balance.remaining = 0;
      totalDeducted += available;
      remainingToDeduct -= available;
      console.log(`  ✅ Used ${available} day from current month (remaining: 0)`);
    }

    if (remainingToDeduct > 0) {
      console.log(`  ℹ️ Current month balance insufficient for half day. Checking previous months...`);

      const previousBalances = await getPreviousMonthsELBalances(
        employeeId,
        leaveTypeDoc._id,
        month,
        year,
        12,
        session
      );

      for (const prevBalance of previousBalances) {
        if (remainingToDeduct <= 0) break;

        const availableFromPrev = Math.min(prevBalance.remaining, remainingToDeduct);

        if (availableFromPrev > 0) {
          prevBalance.balance.used += availableFromPrev;
          prevBalance.balance.remaining -= availableFromPrev;
          totalDeducted += availableFromPrev;
          remainingToDeduct -= availableFromPrev;

          console.log(`  ✅ Used ${availableFromPrev} day (half day) from ${prevBalance.month}/${prevBalance.year} (remaining: ${prevBalance.balance.remaining})`);
          await prevBalance.balance.save({ session });
        }
      }
    }

    if (remainingToDeduct > 0) {
      balance.lop = (balance.lop || 0) + remainingToDeduct;
      totalDeducted += remainingToDeduct;
      console.log(`  ⚠️ LOP: ${remainingToDeduct} days (no EL balance in current or previous months)`);
    }

    balance.deductedDays = balance.deductedDays || [];
    balance.deductedDays.push(dayOfMonth);

    await balance.save({ session });

    console.log(`  ✅ Half day leave balance updated: used=${balance.used}, remaining=${balance.remaining}, lop=${balance.lop || 0}, deductedDays=${balance.deductedDays}`);

    return {
      success: true,
      balance,
      used: balance.used,
      remaining: balance.remaining,
      lop: balance.lop || 0,
      halfDayType,
      deductedAmount: totalDeducted
    };

  } catch (error) {
    console.error(`  ❌ Error deducting half day leave balance:`, error.message);
    return { success: false, message: error.message };
  }
};

const approveRegularization = async (data) => {
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const {
      regularizationId,
      approvedBy,
      approvalRemark,
      approvedPunchIn,
      approvedPunchOut
    } = data;

    // Find regularization request
    const regularization = await AttendanceRegularization.findById(regularizationId)
      .populate('attendanceId')
      .populate('employeeId')
      .session(dbSession);

    if (!regularization) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: "Regularization request not found"
      };
    }

    if (regularization.status !== "PENDING") {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: `Cannot approve a ${regularization.status.toLowerCase()} request`
      };
    }

    const attendance = await Attendance.findById(regularization.attendanceId._id)
      .session(dbSession);

    if (!attendance) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: "Attendance record not found"
      };
    }

    // ================================================================
    // DETERMINE APPROVED PUNCH TIMES
    // ================================================================
    const finalPunchIn = approvedPunchIn || regularization.requestedPunchIn || attendance.date;
    const finalPunchOut = approvedPunchOut || regularization.requestedPunchOut ||
      new Date(new Date(finalPunchIn).getTime() + 8 * 60 * 60 * 1000);

    // ================================================================
    // EXACT SAME LOGIC AS evaluateAttendance FUNCTION
    // ================================================================

    // Office timing constants (same as evaluateAttendance)
    const OFFICE_START = "09:31";
    const GRACE_END = "09:46";
    const MORNING_SHORT_LEAVE_END = "11:46";
    const FIRST_HALF_END = "14:01";
    const SECOND_HALF_START = "14:01";
    const SECOND_HALF_GRACE_END = "14:16";
    const EVENING_SHORT_LEAVE_START = "16:30";
    const OFFICE_END = "18:30";

    const toLocalTime = (utcDate) => moment(utcDate).utcOffset("+05:30");

    const getLocalMomentTime = (baseDay, timeString) => {
      const [hours, minutes] = timeString.split(":").map(Number);
      return moment(baseDay).utcOffset("+05:30").hour(hours).minute(minutes).second(0).millisecond(0);
    };

    // Get first punch (approved punch in) and last punch (approved punch out)
    const day = moment(attendance.date).utcOffset("+05:30").startOf("day");
    const firstPunch = toLocalTime(finalPunchIn);
    const lastPunch = toLocalTime(finalPunchOut);

    console.log(`  ℹ️ Approved First Punch: ${firstPunch.format("HH:mm:ss")}`);
    console.log(`  ℹ️ Approved Last Punch: ${lastPunch.format("HH:mm:ss")}`);

    // Shift boundaries (same as evaluateAttendance)
    const shiftStart = getLocalMomentTime(day, OFFICE_START);
    const graceEnd = getLocalMomentTime(day, GRACE_END);
    const morningShortEnd = getLocalMomentTime(day, MORNING_SHORT_LEAVE_END);
    const firstHalfEnd = getLocalMomentTime(day, FIRST_HALF_END);
    const secondHalfStart = getLocalMomentTime(day, SECOND_HALF_START);
    const secondHalfGraceEnd = getLocalMomentTime(day, SECOND_HALF_GRACE_END);
    const eveningShortStart = getLocalMomentTime(day, EVENING_SHORT_LEAVE_START);
    const shiftEnd = getLocalMomentTime(day, OFFICE_END);

    // Monthly late count (same as evaluateAttendance)
    const monthKey = moment(attendance.date).format("YYYY-MM");
    const employee = await Employee.findById(attendance.employee).session(dbSession);
    const monthLateCount = employee?.lateCounts?.find((m) => m.month === monthKey)?.count || 0;
    const maxLateAllowed = 3; // Default from policy

    console.log(`  ℹ️ Monthly late used: ${monthLateCount}/${maxLateAllowed}`);

    // ================================================================
    // DETERMINE CORE STATUS (EXACT SAME AS evaluateAttendance)
    // ================================================================
    let finalStatus = "ABSENT";
    let isHalfDay = false;
    let halfDayType = null;
    let needsDeduction = true;
    let deductionType = "FULL_DAY";
    let morningShortLeaveFlag = false;
    let eveningShortLeaveFlag = false;

    // Check if arrived after 2:15 PM
    if (firstPunch.isAfter(secondHalfGraceEnd)) {
      console.log(`  ❌ Arrived after 2:15 PM → ABSENT`);
      finalStatus = "ABSENT";
      isHalfDay = false;
      halfDayType = null;
      needsDeduction = true;
      deductionType = "FULL_DAY";
    } else {
      // Determine core status by first punch
      let coreStatus = "PRESENT";
      let coreHalfDayType = null;

      console.log(`\n🔍 Determining CORE status from first punch: ${firstPunch.format("HH:mm:ss")}`);

      // Case 1: Arrived between 11:45 - 14:00 (First Half Day)
      if (firstPunch.isAfter(morningShortEnd) && firstPunch.isBefore(secondHalfStart)) {
        coreStatus = "HALF_DAY";
        coreHalfDayType = "FIRST_HALF";
        console.log(`   → CORE = HALF_DAY (FIRST_HALF)`);
      }
      // Case 2: Arrived between 14:00 - 14:15 (Second Half Day)
      else if (firstPunch.isSameOrAfter(secondHalfStart) && firstPunch.isSameOrBefore(secondHalfGraceEnd)) {
        coreStatus = "HALF_DAY";
        coreHalfDayType = "SECOND_HALF";
        console.log(`   → CORE = HALF_DAY (SECOND_HALF)`);
      }
      // Case 3: Arrived after shift start but before 11:45
      else if (firstPunch.isAfter(shiftStart)) {
        const lateMins = firstPunch.diff(shiftStart, "minutes");

        // Grace period (09:30 - 09:45) with exceeded limit
        if (firstPunch.isSameOrBefore(graceEnd) && monthLateCount >= maxLateAllowed) {
          coreStatus = "SHORT_LEAVE";
          morningShortLeaveFlag = true;
          console.log(`   → CORE = SHORT_LEAVE (grace arrival, limit exceeded)`);
        }
        // Short leave window (09:45 - 11:45)
        else if (firstPunch.isAfter(graceEnd) && firstPunch.isSameOrBefore(morningShortEnd)) {
          coreStatus = "SHORT_LEAVE";
          morningShortLeaveFlag = true;
          console.log(`   → CORE = SHORT_LEAVE (short leave window)`);
        }
      }

      console.log(`  ℹ️ Core Status: ${coreStatus}`);

      // ================================================================
      // CHECK EVENING SHORT LEAVE (EXACT SAME AS evaluateAttendance)
      // ================================================================

      if (lastPunch.isSameOrAfter(eveningShortStart) && lastPunch.isBefore(shiftEnd)) {
        const shortLeaveMins = shiftEnd.diff(lastPunch, "minutes");
        if (shortLeaveMins > 0 && shortLeaveMins <= 120) {
          eveningShortLeaveFlag = true;
          console.log(`  ℹ️ Evening short leave: ${shortLeaveMins} min`);
        }
      }

      // ================================================================
      // DETERMINE FINAL STATUS (EXACT SAME AS evaluateAttendance)
      // ================================================================

      const workingMinutes = Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60));
      console.log(`  ℹ️ Total working minutes: ${workingMinutes}`);

      // Get policy thresholds
      const minFullDay = 480; // 8 hours
      const minHalfDay = 240; // 4 hours

      // CASE A: Core status is HALF_DAY
      if (coreStatus === "HALF_DAY") {
        if (workingMinutes < 30) {
          finalStatus = "ABSENT";
          isHalfDay = false;
          halfDayType = null;
          needsDeduction = true;
          deductionType = "FULL_DAY";
          console.log(`\n❌ Core is HALF_DAY but worked only ${workingMinutes}m (< 30) → ABSENT`);
        } else {
          finalStatus = "HALF_DAY";
          isHalfDay = true;
          halfDayType = coreHalfDayType || "FIRST_HALF";
          needsDeduction = true;
          deductionType = "HALF_DAY";
          console.log(`\n✅ Core is HALF_DAY, worked ${workingMinutes}m → HALF_DAY`);
        }
      }
      // CASE B: Core status is SHORT_LEAVE
      else if (coreStatus === "SHORT_LEAVE") {
        if (workingMinutes >= minFullDay) {
          finalStatus = "SHORT_LEAVE";
          isHalfDay = true;
          halfDayType = "SECOND_HALF";
          needsDeduction = true;
          deductionType = "SHORT_LEAVE";
          console.log(`\n✅ Worked full day (${workingMinutes}m) → SHORT_LEAVE`);
        } else if (workingMinutes >= minHalfDay) {
          finalStatus = "SHORT_LEAVE";
          isHalfDay = true;
          halfDayType = "SECOND_HALF";
          needsDeduction = true;
          deductionType = "SHORT_LEAVE";
          console.log(`\n✅ Worked half day (${workingMinutes}m) → SHORT_LEAVE`);
        } else if (workingMinutes > 0) {
          finalStatus = "ABSENT";
          isHalfDay = false;
          halfDayType = null;
          needsDeduction = true;
          deductionType = "FULL_DAY";
          console.log(`\n❌ Worked only ${workingMinutes}m (< half day) → ABSENT`);
        } else {
          finalStatus = "ABSENT";
          isHalfDay = false;
          halfDayType = null;
          needsDeduction = true;
          deductionType = "FULL_DAY";
          console.log(`\n❌ No working minutes → ABSENT`);
        }
      }
      // CASE C: Core status is PRESENT
      else if (coreStatus === "PRESENT") {
        // IMPORTANT: Check for evening short leave first
        if (eveningShortLeaveFlag && workingMinutes >= minHalfDay && workingMinutes < minFullDay) {
          finalStatus = "SHORT_LEAVE";
          isHalfDay = true;
          halfDayType = "SECOND_HALF";
          needsDeduction = true;
          deductionType = "SHORT_LEAVE";
          console.log(`\n✅ Evening short leave detected (left at ${lastPunch.format("HH:mm:ss")}) → SHORT_LEAVE`);
        }
        // Check for morning short leave
        else if (morningShortLeaveFlag && workingMinutes >= minHalfDay && workingMinutes < minFullDay) {
          finalStatus = "SHORT_LEAVE";
          isHalfDay = true;
          halfDayType = "SECOND_HALF";
          needsDeduction = true;
          deductionType = "SHORT_LEAVE";
          console.log(`\n✅ Morning short leave detected → SHORT_LEAVE`);
        }
        else if (workingMinutes >= minFullDay) {
          const hasShortLeave = morningShortLeaveFlag || eveningShortLeaveFlag;
          finalStatus = hasShortLeave ? "SHORT_LEAVE" : "PRESENT";
          isHalfDay = hasShortLeave ? true : false;
          halfDayType = hasShortLeave ? "SECOND_HALF" : null;
          needsDeduction = hasShortLeave ? true : false;
          deductionType = hasShortLeave ? "SHORT_LEAVE" : null;
          console.log(`\n✅ Worked full day (${workingMinutes}m) → ${finalStatus}`);
        }
        else if (workingMinutes >= minHalfDay) {
          finalStatus = "HALF_DAY";
          isHalfDay = true;
          // Determine half day type based on which half was missed
          if (firstPunch.isSameOrAfter(secondHalfStart)) {
            halfDayType = "SECOND_HALF";
          } else {
            halfDayType = "FIRST_HALF";
          }
          needsDeduction = true;
          deductionType = "HALF_DAY";
          console.log(`\n⚠️ Worked half day (${workingMinutes}m) → HALF_DAY (${halfDayType})`);
        }
        else if (workingMinutes > 0) {
          finalStatus = "ABSENT";
          isHalfDay = false;
          halfDayType = null;
          needsDeduction = true;
          deductionType = "FULL_DAY";
          console.log(`\n❌ Worked only ${workingMinutes}m (< half day) → ABSENT`);
        }
        else {
          finalStatus = "ABSENT";
          isHalfDay = false;
          halfDayType = null;
          needsDeduction = true;
          deductionType = "FULL_DAY";
          console.log(`\n❌ No working minutes → ABSENT`);
        }
      }
      // CASE D: Core status is ABSENT
      else {
        finalStatus = "ABSENT";
        isHalfDay = false;
        halfDayType = null;
        needsDeduction = true;
        deductionType = "FULL_DAY";
        console.log(`\n❌ Core status is ABSENT → ABSENT`);
      }
    }

    console.log(`\n🎯 Final Status: ${finalStatus}`);
    console.log(`   Is Half Day: ${isHalfDay}`);
    console.log(`   Half Day Type: ${halfDayType}`);
    console.log(`   Needs Deduction: ${needsDeduction}`);
    console.log(`   Deduction Type: ${deductionType}`);

    // ================================================================
    // CHECK IF LEAVE WAS AUTOMATICALLY DEDUCTED AND ADD BACK IF NEEDED
    // ================================================================
    let leaveAddedBack = false;
    let leaveAdditionDetails = {};
    let isLeaveAdjusted = false;

    const attendanceStatus = (attendance.attendanceStatus || '').trim().toUpperCase();
    const coreStatus = (attendance.coreAttendanceStatus || '').trim().toUpperCase();

    console.log(`  ℹ️ Attendance Status: "${attendanceStatus}", Core Status: "${coreStatus}"`);
    console.log(`  ℹ️ Attendance regularized: ${attendance.regularized || false}`);

    const attendanceDayOfMonth = moment(attendance.date).date();

    if ((attendanceStatus === "ABSENT" || coreStatus === "ABSENT") && !attendance.regularized) {
      console.log(`  ℹ️ Attendance is marked as ABSENT and not regularized. Checking if leave was automatically deducted...`);

      const month = moment(attendance.date).month() + 1;
      const year = moment(attendance.date).year();

      // ================================================================
      // CHECK FOR SHORT LEAVE DEDUCTION FIRST
      // ================================================================
      let leaveWasDeducted = false;
      let deductionAmount = 0;
      let deductedFromSL = false;
      let slBalanceFound = null;

      // Get Short Leave (SL) type
      const slLeaveTypeDoc = await LeaveType.findOne({ code: "SL" }).session(dbSession);

      if (slLeaveTypeDoc) {
        // Check SL balance for this month
        const slBalance = await LeaveBalance.findOne({
          employeeId: attendance.employee,
          leaveTypeId: slLeaveTypeDoc._id,
          month,
          year
        }).session(dbSession);

        if (slBalance && slBalance.deductedDays && slBalance.deductedDays.includes(attendanceDayOfMonth)) {
          leaveWasDeducted = true;
          deductionAmount = 1; // SHORT LEAVE deducts 1 day from SL balance
          deductedFromSL = true;
          slBalanceFound = slBalance;
          console.log(`  ℹ️ Short Leave (SL) deduction found: 1 day`);
        }
      }

      // ================================================================
      // IF NOT DEDUCTED FROM SL, CHECK EL BALANCE
      // ================================================================
      if (!leaveWasDeducted) {
        const elLeaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(dbSession);

        if (elLeaveTypeDoc) {
          const elBalance = await LeaveBalance.findOne({
            employeeId: attendance.employee,
            leaveTypeId: elLeaveTypeDoc._id,
            month,
            year
          }).session(dbSession);

          if (elBalance && elBalance.deductedDays && elBalance.deductedDays.includes(attendanceDayOfMonth)) {
            // Determine how much was deducted (full day or half day)
            const originalAttendance = await Attendance.findById(attendance._id).session(dbSession);
            if (originalAttendance && originalAttendance.isHalfDay) {
              deductionAmount = 0.5;
              console.log(`  ℹ️ Deduction was HALF DAY (0.5 day) from EL balance`);
            } else {
              deductionAmount = 1;
              console.log(`  ℹ️ Deduction was FULL DAY (1 day) from EL balance`);
            }
            leaveWasDeducted = true;
          }
        }
      }

      // ================================================================
      // IF NOT FOUND IN CURRENT MONTH, CHECK PREVIOUS MONTHS
      // ================================================================
      if (!leaveWasDeducted) {
        // Check previous months for SL
        if (slLeaveTypeDoc) {
          const previousSLBalances = await getPreviousMonthsELBalances(
            attendance.employee,
            slLeaveTypeDoc._id,
            month,
            year,
            12,
            dbSession
          );

          for (const prevBalance of previousSLBalances) {
            if (prevBalance.balance.deductedDays && prevBalance.balance.deductedDays.includes(attendanceDayOfMonth)) {
              leaveWasDeducted = true;
              deductionAmount = 1; // SHORT LEAVE deducts 1 day from SL balance
              deductedFromSL = true;
              slBalanceFound = prevBalance.balance;
              console.log(`  ℹ️ Short Leave (SL) deduction found in ${prevBalance.month}/${prevBalance.year}: 1 day`);
              break;
            }
          }
        }

        // If not found in SL, check EL in previous months
        if (!leaveWasDeducted) {
          const elLeaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(dbSession);
          if (elLeaveTypeDoc) {
            const previousELBalances = await getPreviousMonthsELBalances(
              attendance.employee,
              elLeaveTypeDoc._id,
              month,
              year,
              12,
              dbSession
            );

            for (const prevBalance of previousELBalances) {
              if (prevBalance.balance.deductedDays && prevBalance.balance.deductedDays.includes(attendanceDayOfMonth)) {
                leaveWasDeducted = true;
                const originalAttendance = await Attendance.findById(attendance._id).session(dbSession);
                if (originalAttendance && originalAttendance.isHalfDay) {
                  deductionAmount = 0.5;
                } else {
                  deductionAmount = 1;
                }
                console.log(`  ℹ️ Deduction found in ${prevBalance.month}/${prevBalance.year}: ${deductionAmount} day(s)`);
                break;
              }
            }
          }
        }
      }

      // ================================================================
      // REVERT THE DEDUCTION
      // ================================================================
      if (leaveWasDeducted && deductionAmount > 0) {
        console.log(`  ℹ️ Leave was automatically deducted: ${deductionAmount} day(s). Adding back to balance...`);

        let addBackResult = null;

        if (deductedFromSL && slBalanceFound) {
          // Revert from SL balance
          console.log(`  ℹ️ Reverting from Short Leave (SL) balance...`);

          // Reduce used and increase remaining
          const reduceUsed = Math.min(slBalanceFound.used || 0, deductionAmount);
          if (reduceUsed > 0) {
            slBalanceFound.used = Math.max(0, slBalanceFound.used - reduceUsed);
            slBalanceFound.remaining = (slBalanceFound.remaining || 0) + reduceUsed;
            console.log(`  ✅ Reduced SL used by ${reduceUsed}, remaining now: ${slBalanceFound.remaining}`);
          }

          // Remove the day from deductedDays
          if (slBalanceFound.deductedDays && slBalanceFound.deductedDays.includes(attendanceDayOfMonth)) {
            slBalanceFound.deductedDays = slBalanceFound.deductedDays.filter(
              (d) => d !== attendanceDayOfMonth
            );
            console.log(`  ✅ Removed day ${attendanceDayOfMonth} from SL deductedDays`);
          }

          await slBalanceFound.save({ session: dbSession });

          leaveAddedBack = true;
          isLeaveAdjusted = true;
          addBackResult = {
            success: true,
            totalAddedBack: deductionAmount,
            fromSL: true,
            message: `Added back ${deductionAmount} day(s) from Short Leave balance`
          };
          leaveAdditionDetails = addBackResult;
          console.log(`  ✅ ${deductionAmount} day(s) added back from Short Leave balance`);
        } else {
          // Revert from EL balance (existing logic)
          const elLeaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(dbSession);

          if (elLeaveTypeDoc) {
            const currentMonthBalance = await LeaveBalance.findOne({
              employeeId: attendance.employee,
              leaveTypeId: elLeaveTypeDoc._id,
              month,
              year
            }).session(dbSession);

            if (currentMonthBalance) {
              // Check for LOP reduction first
              if (currentMonthBalance.lop && currentMonthBalance.lop > 0) {
                const reduceLop = Math.min(currentMonthBalance.lop, deductionAmount);
                currentMonthBalance.lop = Math.max(0, currentMonthBalance.lop - reduceLop);

                // Remove this day from deductedDays
                if (currentMonthBalance.deductedDays && currentMonthBalance.deductedDays.includes(attendanceDayOfMonth)) {
                  currentMonthBalance.deductedDays = currentMonthBalance.deductedDays.filter(
                    (d) => d !== attendanceDayOfMonth
                  );
                }

                await currentMonthBalance.save({ session: dbSession });
                leaveAddedBack = true;
                isLeaveAdjusted = true;
                addBackResult = {
                  success: true,
                  message: `Reduced LOP by ${reduceLop} day(s)`,
                  totalAddedBack: reduceLop,
                  fromLOP: true
                };
                leaveAdditionDetails = addBackResult;
                console.log(`  ✅ Reduced LOP by ${reduceLop} day(s)`);
              } else {
                // Try to add back to remaining balance
                const reduceUsed = Math.min(currentMonthBalance.used || 0, deductionAmount);
                if (reduceUsed > 0) {
                  currentMonthBalance.used = Math.max(0, currentMonthBalance.used - reduceUsed);
                  currentMonthBalance.remaining = (currentMonthBalance.remaining || 0) + reduceUsed;

                  // Remove this day from deductedDays
                  if (currentMonthBalance.deductedDays && currentMonthBalance.deductedDays.includes(attendanceDayOfMonth)) {
                    currentMonthBalance.deductedDays = currentMonthBalance.deductedDays.filter(
                      (d) => d !== attendanceDayOfMonth
                    );
                  }

                  await currentMonthBalance.save({ session: dbSession });
                  leaveAddedBack = true;
                  isLeaveAdjusted = true;
                  addBackResult = {
                    success: true,
                    message: `Added ${reduceUsed} day(s) back to remaining balance`,
                    totalAddedBack: reduceUsed
                  };
                  leaveAdditionDetails = addBackResult;
                  console.log(`  ✅ Added ${reduceUsed} day(s) back to remaining balance`);
                } else {
                  // Check previous months for LOP
                  const previousBalances = await getPreviousMonthsELBalances(
                    attendance.employee,
                    elLeaveTypeDoc._id,
                    month,
                    year,
                    12,
                    dbSession
                  );

                  for (const prevBalance of previousBalances) {
                    if (prevBalance.balance.lop > 0) {
                      const reduceLop = Math.min(prevBalance.balance.lop, deductionAmount);
                      prevBalance.balance.lop = Math.max(0, prevBalance.balance.lop - reduceLop);

                      if (prevBalance.balance.deductedDays && prevBalance.balance.deductedDays.includes(attendanceDayOfMonth)) {
                        prevBalance.balance.deductedDays = prevBalance.balance.deductedDays.filter(
                          (d) => d !== attendanceDayOfMonth
                        );
                      }

                      await prevBalance.balance.save({ session: dbSession });
                      leaveAddedBack = true;
                      isLeaveAdjusted = true;
                      addBackResult = {
                        success: true,
                        message: `Reduced LOP by ${reduceLop} day(s) from ${prevBalance.month}/${prevBalance.year}`,
                        totalAddedBack: reduceLop,
                        fromLOP: true,
                        fromMonth: prevBalance.month,
                        fromYear: prevBalance.year
                      };
                      leaveAdditionDetails = addBackResult;
                      console.log(`  ✅ Reduced LOP by ${reduceLop} day(s) from ${prevBalance.month}/${prevBalance.year}`);
                      break;
                    }
                  }
                }
              }
            } else {
              console.log(`  ℹ️ No EL balance found for this month.`);
            }
          }
        }

        if (!leaveAddedBack) {
          console.log(`  ⚠️ Could not add back leave balance. No sufficient balance found.`);
          leaveAdditionDetails = {
            success: false,
            message: "Could not add back leave balance"
          };
        }
      } else {
        console.log(`  ℹ️ No automatic leave deduction found for this date.`);
      }
    } else {
      console.log(`  ℹ️ Attendance is not ABSENT or already regularized. Status: "${attendanceStatus}", Regularized: ${attendance.regularized || false}`);
    }

    // ================================================================
    // APPLY NEW LEAVE DEDUCTION BASED ON EVALUATOR LOGIC
    // ================================================================
    if (needsDeduction && deductionType) {
      console.log(`  ℹ️ Applying new leave deduction based on evaluator logic...`);

      let deductionResult = null;

      if (deductionType === "HALF_DAY") {
        console.log(`  ℹ️ Applying HALF DAY deduction (0.5 day)...`);
        deductionResult = await deductHalfDayLeaveBalance(
          attendance.employee,
          attendance.date,
          halfDayType || "FIRST_HALF",
          "EL",
          dbSession
        );
        if (deductionResult.success) {
          console.log(`  ✅ Half day leave deducted successfully.`);
        }
      } else if (deductionType === "SHORT_LEAVE") {
        console.log(`  ℹ️ Applying SHORT LEAVE deduction...`);

        // Get Short Leave (SL) type
        const slLeaveTypeDoc = await LeaveType.findOne({ code: "SL" }).session(dbSession);
        let slDeductionSuccess = false;
        const deductionMonth = moment(attendance.date).month() + 1;
        const deductionYear = moment(attendance.date).year();
        const deductionDay = moment(attendance.date).date();

        if (slLeaveTypeDoc) {
          // Check SL balance for this month
          let slBalance = await LeaveBalance.findOne({
            employeeId: attendance.employee,
            leaveTypeId: slLeaveTypeDoc._id,
            month: deductionMonth,
            year: deductionYear
          }).session(dbSession);

          // If no SL balance for this month, create one
          if (!slBalance) {
            slBalance = new LeaveBalance({
              employeeId: attendance.employee,
              leaveTypeId: slLeaveTypeDoc._id,
              month: deductionMonth,
              year: deductionYear,
              total: 0,
              used: 0,
              remaining: 0,
              lop: 0,
              deductedDays: []
            });
            console.log(`  ℹ️ Created new SL balance for ${deductionMonth}/${deductionYear}`);
          }

          // Check if SL balance has remaining leaves (1 day for short leave)
          if (slBalance.remaining >= 1) {
            // Deduct 1 day from SL balance
            slBalance.used = (slBalance.used || 0) + 1;
            slBalance.remaining = Math.max(0, (slBalance.remaining || 0) - 1);
            slBalance.deductedDays = slBalance.deductedDays || [];
            if (!slBalance.deductedDays.includes(deductionDay)) {
              slBalance.deductedDays.push(deductionDay);
            }
            await slBalance.save({ session: dbSession });
            slDeductionSuccess = true;
            deductionResult = {
              success: true,
              message: "Short leave deducted from SL balance (1 day)",
              fromSL: true,
              deductedAmount: 1
            };
            console.log(`  ✅ Short leave deducted from SL balance (1 day). Remaining: ${slBalance.remaining}`);
          } else {
            console.log(`  ℹ️ Insufficient SL balance. Remaining: ${slBalance.remaining}, Required: 1`);
          }
        }

        // If SL deduction failed (no balance or insufficient), try EL balance (0.5 day)
        if (!slDeductionSuccess) {
          console.log(`  ℹ️ No SL balance available. Trying EL balance as HALF DAY (0.5 day)...`);
          deductionResult = await deductHalfDayLeaveBalance(
            attendance.employee,
            attendance.date,
            "SECOND_HALF",
            "EL",
            dbSession
          );
          if (deductionResult.success) {
            console.log(`  ✅ Short leave deducted from EL balance as half day (0.5 day).`);
          } else {
            // If EL balance also fails, deduct from LOP
            console.log(`  ℹ️ No EL balance available. Deducting from LOP...`);
            const elLeaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(dbSession);
            if (elLeaveTypeDoc) {
              let elBalance = await LeaveBalance.findOne({
                employeeId: attendance.employee,
                leaveTypeId: elLeaveTypeDoc._id,
                month: deductionMonth,
                year: deductionYear
              }).session(dbSession);

              if (!elBalance) {
                elBalance = new LeaveBalance({
                  employeeId: attendance.employee,
                  leaveTypeId: elLeaveTypeDoc._id,
                  month: deductionMonth,
                  year: deductionYear,
                  total: 0,
                  used: 0,
                  remaining: 0,
                  lop: 0,
                  deductedDays: []
                });
              }

              // Deduct from LOP (0.5 day)
              elBalance.lop = (elBalance.lop || 0) + 0.5;
              elBalance.deductedDays = elBalance.deductedDays || [];
              if (!elBalance.deductedDays.includes(deductionDay)) {
                elBalance.deductedDays.push(deductionDay);
              }
              await elBalance.save({ session: dbSession });
              deductionResult = {
                success: true,
                message: "Short leave deducted from LOP (0.5 day)",
                fromLOP: true,
                deductedAmount: 0.5
              };
              console.log(`  ✅ Short leave deducted from LOP (0.5 day). Total LOP: ${elBalance.lop}`);
            }
          }
        }
      } else if (deductionType === "FULL_DAY") {
        console.log(`  ℹ️ Applying FULL DAY deduction (1 day)...`);
        deductionResult = await deductLeaveBalanceForDate(
          attendance.employee,
          attendance.date,
          "EL",
          dbSession
        );
        if (deductionResult.success) {
          console.log(`  ✅ Full day leave deducted successfully.`);
        }
      }

      if (deductionResult) {
        isLeaveAdjusted = true;
        leaveAdditionDetails = {
          ...leaveAdditionDetails,
          deductionApplied: true,
          deductionType: deductionType,
          deductionResult: deductionResult
        };
      }
    } else {
      console.log(`  ℹ️ No leave deduction needed for this regularization.`);
    }

    // ================================================================
    // UPDATE ATTENDANCE RECORD
    // ================================================================

    const requestType = regularization.requestType;

    if (attendance.sessions.length === 0) {
      attendance.sessions.push({
        punchIn: finalPunchIn,
        punchOut: finalPunchOut,
        durationMinutes: Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60)),
        manualPunchedOut: true,
        punchOutLocation: {
          address: "Regularized attendance"
        },
        punchInLocation: {
          address: "Regularized attendance"
        }
      });
      console.log(`  ✅ Created new session`);
    } else {
      const firstSession = attendance.sessions[0];

      if (requestType === "MISSING_PUNCH_IN" || requestType === "MISSING_BOTH" || requestType === "ABSENT_MARKED") {
        firstSession.punchIn = finalPunchIn;
        firstSession.punchInLocation = firstSession.punchInLocation || {
          address: "Regularized attendance"
        };
      }

      if (requestType === "MISSING_PUNCH_OUT" || requestType === "MISSING_BOTH" || requestType === "ABSENT_MARKED") {
        firstSession.punchOut = finalPunchOut;
        firstSession.durationMinutes = Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60));
        firstSession.manualPunchedOut = true;
        firstSession.punchOutLocation = {
          address: "Regularized attendance"
        };
      }

      if (requestType === "WRONG_PUNCH_TIME") {
        firstSession.punchIn = finalPunchIn;
        firstSession.punchOut = finalPunchOut;
        firstSession.durationMinutes = Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60));
        firstSession.manualPunchedOut = true;
        firstSession.punchInLocation = firstSession.punchInLocation || {
          address: "Regularized attendance"
        };
        firstSession.punchOutLocation = {
          address: "Regularized attendance"
        };
      }
    }

    attendance.firstPunchIn = attendance.sessions[0]?.punchIn || finalPunchIn;
    attendance.lastPunchOut = attendance.sessions[attendance.sessions.length - 1]?.punchOut || finalPunchOut;
    attendance.totalWorkingMinutes = attendance.sessions.reduce(
      (sum, s) => sum + (s.durationMinutes || 0), 0
    );

    attendance.regularized = true;
    attendance.regularizationRequestId = regularizationId;
    attendance.regularizedAt = new Date();
    attendance.regularizedBy = approvedBy;

    attendance.attendanceStatus = finalStatus;
    attendance.coreAttendanceStatus = finalStatus;
    attendance.status = finalStatus === "PRESENT" || finalStatus === "ON_LEAVE" ? "PRESENT" : "ABSENT";
    attendance.isHalfDay = isHalfDay;
    attendance.halfDayType = halfDayType;
    attendance.isLate = false;
    attendance.lateMinutes = 0;
    attendance.isEarlyLeave = false;
    attendance.earlyLeaveMinutes = 0;

    // const remarks = `Regularized by ${approvedBy} on ${new Date().toISOString()}. Punch In: ${moment(finalPunchIn).format('HH:mm')}, Punch Out: ${moment(finalPunchOut).format('HH:mm')}. Status: ${finalStatus}${isHalfDay ? ` (${halfDayType})` : ''}. ${approvalRemark || ''}`;
    // attendance.remarks = attendance.remarks
    //   ? `${attendance.remarks} | ${remarks}`
    //   : remarks;

    const remarks = `Reg ${finalStatus} ${moment(finalPunchIn).format('HH:mm')}-${moment(finalPunchOut).format('HH:mm')}`;

    attendance.remarks = attendance.remarks
      ? `${attendance.remarks} | ${remarks}`.slice(0, 20)
      : remarks.slice(0, 20);

    await attendance.save({ session: dbSession });
    console.log(`  ✅ Attendance record updated with status: ${finalStatus}`);

    // ================================================================
    // UPDATE REGULARIZATION REQUEST
    // ================================================================
    regularization.status = "APPROVED";
    regularization.approvedBy = approvedBy;
    regularization.approvedAt = new Date();
    regularization.approvalRemark = approvalRemark || "Regularization approved";
    regularization.approvedPunchIn = finalPunchIn;
    regularization.approvedPunchOut = finalPunchOut;
    regularization.isLeaveAdjusted = isLeaveAdjusted;

    await regularization.save({ session: dbSession });
    console.log(`  ✅ Regularization request approved`);

    await dbSession.commitTransaction();
    dbSession.endSession();

    return {
      success: true,
      message: "Regularization request approved successfully",
      data: {
        regularization,
        attendance,
        leaveAddedBack,
        leaveAdditionDetails,
        finalStatus,
        isHalfDay,
        halfDayType,
        needsDeduction,
        deductionType
      }
    };

  } catch (error) {
    await dbSession.abortTransaction();
    dbSession.endSession();
    console.error("Error in approveRegularization:", error);
    throw error;
  }
};
// const approveRegularization = async (data) => {
//   const dbSession = await mongoose.startSession();
//   dbSession.startTransaction();

//   try {
//     const {
//       regularizationId,
//       approvedBy,
//       approvalRemark,
//       approvedPunchIn,
//       approvedPunchOut
//     } = data;

//     // Find regularization request
//     const regularization = await AttendanceRegularization.findById(regularizationId)
//       .populate('attendanceId')
//       .populate('employeeId')
//       .session(dbSession);

//     if (!regularization) {
//       await dbSession.abortTransaction();
//       dbSession.endSession();
//       return {
//         success: false,
//         message: "Regularization request not found"
//       };
//     }

//     if (regularization.status !== "PENDING") {
//       await dbSession.abortTransaction();
//       dbSession.endSession();
//       return {
//         success: false,
//         message: `Cannot approve a ${regularization.status.toLowerCase()} request`
//       };
//     }

//     const attendance = await Attendance.findById(regularization.attendanceId._id)
//       .session(dbSession);

//     if (!attendance) {
//       await dbSession.abortTransaction();
//       dbSession.endSession();
//       return {
//         success: false,
//         message: "Attendance record not found"
//       };
//     }

//     // ================================================================
//     // DETERMINE APPROVED PUNCH TIMES
//     // ================================================================
//     const finalPunchIn = approvedPunchIn || regularization.requestedPunchIn || attendance.date;
//     const finalPunchOut = approvedPunchOut || regularization.requestedPunchOut ||
//       new Date(new Date(finalPunchIn).getTime() + 8 * 60 * 60 * 1000);

//     // ================================================================
//     // EXACT SAME LOGIC AS evaluateAttendance FUNCTION
//     // ================================================================

//     // Office timing constants (same as evaluateAttendance)
//     const OFFICE_START = "09:31";
//     const GRACE_END = "09:46";
//     const MORNING_SHORT_LEAVE_END = "11:46";
//     const FIRST_HALF_END = "14:01";
//     const SECOND_HALF_START = "14:01";
//     const SECOND_HALF_GRACE_END = "14:16";
//     const EVENING_SHORT_LEAVE_START = "16:30";
//     const OFFICE_END = "18:30";

//     const toLocalTime = (utcDate) => moment(utcDate).utcOffset("+05:30");

//     const getLocalMomentTime = (baseDay, timeString) => {
//       const [hours, minutes] = timeString.split(":").map(Number);
//       return moment(baseDay).utcOffset("+05:30").hour(hours).minute(minutes).second(0).millisecond(0);
//     };

//     // Get first punch (approved punch in) and last punch (approved punch out)
//     const day = moment(attendance.date).utcOffset("+05:30").startOf("day");
//     const firstPunch = toLocalTime(finalPunchIn);
//     const lastPunch = toLocalTime(finalPunchOut);

//     console.log(`  ℹ️ Approved First Punch: ${firstPunch.format("HH:mm:ss")}`);
//     console.log(`  ℹ️ Approved Last Punch: ${lastPunch.format("HH:mm:ss")}`);

//     // Shift boundaries (same as evaluateAttendance)
//     const shiftStart = getLocalMomentTime(day, OFFICE_START);
//     const graceEnd = getLocalMomentTime(day, GRACE_END);
//     const morningShortEnd = getLocalMomentTime(day, MORNING_SHORT_LEAVE_END);
//     const firstHalfEnd = getLocalMomentTime(day, FIRST_HALF_END);
//     const secondHalfStart = getLocalMomentTime(day, SECOND_HALF_START);
//     const secondHalfGraceEnd = getLocalMomentTime(day, SECOND_HALF_GRACE_END);
//     const eveningShortStart = getLocalMomentTime(day, EVENING_SHORT_LEAVE_START);
//     const shiftEnd = getLocalMomentTime(day, OFFICE_END);

//     // Monthly late count (same as evaluateAttendance)
//     const monthKey = moment(attendance.date).format("YYYY-MM");
//     const employee = await Employee.findById(attendance.employee).session(dbSession);
//     const monthLateCount = employee?.lateCounts?.find((m) => m.month === monthKey)?.count || 0;
//     const maxLateAllowed = 3; // Default from policy

//     console.log(`  ℹ️ Monthly late used: ${monthLateCount}/${maxLateAllowed}`);

//     // ================================================================
//     // DETERMINE CORE STATUS (EXACT SAME AS evaluateAttendance)
//     // ================================================================
//     let finalStatus = "ABSENT";
//     let isHalfDay = false;
//     let halfDayType = null;
//     let needsDeduction = true;
//     let deductionType = "FULL_DAY";
//     let morningShortLeaveFlag = false;
//     let eveningShortLeaveFlag = false;

//     // Check if arrived after 2:15 PM
//     if (firstPunch.isAfter(secondHalfGraceEnd)) {
//       console.log(`  ❌ Arrived after 2:15 PM → ABSENT`);
//       finalStatus = "ABSENT";
//       isHalfDay = false;
//       halfDayType = null;
//       needsDeduction = true;
//       deductionType = "FULL_DAY";
//     } else {
//       // Determine core status by first punch
//       let coreStatus = "PRESENT";
//       let coreHalfDayType = null;

//       console.log(`\n🔍 Determining CORE status from first punch: ${firstPunch.format("HH:mm:ss")}`);

//       // Case 1: Arrived between 11:45 - 14:00 (First Half Day)
//       if (firstPunch.isAfter(morningShortEnd) && firstPunch.isBefore(secondHalfStart)) {
//         coreStatus = "HALF_DAY";
//         coreHalfDayType = "FIRST_HALF";
//         console.log(`   → CORE = HALF_DAY (FIRST_HALF)`);
//       }
//       // Case 2: Arrived between 14:00 - 14:15 (Second Half Day)
//       else if (firstPunch.isSameOrAfter(secondHalfStart) && firstPunch.isSameOrBefore(secondHalfGraceEnd)) {
//         coreStatus = "HALF_DAY";
//         coreHalfDayType = "SECOND_HALF";
//         console.log(`   → CORE = HALF_DAY (SECOND_HALF)`);
//       }
//       // Case 3: Arrived after shift start but before 11:45
//       else if (firstPunch.isAfter(shiftStart)) {
//         const lateMins = firstPunch.diff(shiftStart, "minutes");

//         // Grace period (09:30 - 09:45) with exceeded limit
//         if (firstPunch.isSameOrBefore(graceEnd) && monthLateCount >= maxLateAllowed) {
//           coreStatus = "SHORT_LEAVE";
//           morningShortLeaveFlag = true;
//           console.log(`   → CORE = SHORT_LEAVE (grace arrival, limit exceeded)`);
//         }
//         // Short leave window (09:45 - 11:45)
//         else if (firstPunch.isAfter(graceEnd) && firstPunch.isSameOrBefore(morningShortEnd)) {
//           coreStatus = "SHORT_LEAVE";
//           morningShortLeaveFlag = true;
//           console.log(`   → CORE = SHORT_LEAVE (short leave window)`);
//         }
//       }

//       console.log(`  ℹ️ Core Status: ${coreStatus}`);

//       // ================================================================
//       // CHECK EVENING SHORT LEAVE (EXACT SAME AS evaluateAttendance)
//       // ================================================================

//       if (lastPunch.isSameOrAfter(eveningShortStart) && lastPunch.isBefore(shiftEnd)) {
//         const shortLeaveMins = shiftEnd.diff(lastPunch, "minutes");
//         if (shortLeaveMins > 0 && shortLeaveMins <= 120) {
//           eveningShortLeaveFlag = true;
//           console.log(`  ℹ️ Evening short leave: ${shortLeaveMins} min`);
//         }
//       }

//       // ================================================================
//       // DETERMINE FINAL STATUS (EXACT SAME AS evaluateAttendance)
//       // ================================================================

//       const workingMinutes = Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60));
//       console.log(`  ℹ️ Total working minutes: ${workingMinutes}`);

//       // Get policy thresholds
//       const minFullDay = 480; // 8 hours
//       const minHalfDay = 240; // 4 hours

//       // CASE A: Core status is HALF_DAY
//       if (coreStatus === "HALF_DAY") {
//         if (workingMinutes < 30) {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ Core is HALF_DAY but worked only ${workingMinutes}m (< 30) → ABSENT`);
//         } else {
//           finalStatus = "HALF_DAY";
//           isHalfDay = true;
//           halfDayType = coreHalfDayType || "FIRST_HALF";
//           needsDeduction = true;
//           deductionType = "HALF_DAY";
//           console.log(`\n✅ Core is HALF_DAY, worked ${workingMinutes}m → HALF_DAY`);
//         }
//       }
//       // CASE B: Core status is SHORT_LEAVE
//       else if (coreStatus === "SHORT_LEAVE") {
//         if (workingMinutes >= minFullDay) {
//           finalStatus = "SHORT_LEAVE";
//           isHalfDay = true;
//           halfDayType = "SECOND_HALF";
//           needsDeduction = true;
//           deductionType = "SHORT_LEAVE";
//           console.log(`\n✅ Worked full day (${workingMinutes}m) → SHORT_LEAVE`);
//         } else if (workingMinutes >= minHalfDay) {
//           finalStatus = "SHORT_LEAVE";
//           isHalfDay = true;
//           halfDayType = "SECOND_HALF";
//           needsDeduction = true;
//           deductionType = "SHORT_LEAVE";
//           console.log(`\n✅ Worked half day (${workingMinutes}m) → SHORT_LEAVE`);
//         } else if (workingMinutes > 0) {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ Worked only ${workingMinutes}m (< half day) → ABSENT`);
//         } else {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ No working minutes → ABSENT`);
//         }
//       }
//       // CASE C: Core status is PRESENT
//       else if (coreStatus === "PRESENT") {
//         // IMPORTANT: Check for evening short leave first
//         if (eveningShortLeaveFlag && workingMinutes >= minHalfDay && workingMinutes < minFullDay) {
//           finalStatus = "SHORT_LEAVE";
//           isHalfDay = true;
//           halfDayType = "SECOND_HALF";
//           needsDeduction = true;
//           deductionType = "SHORT_LEAVE";
//           console.log(`\n✅ Evening short leave detected (left at ${lastPunch.format("HH:mm:ss")}) → SHORT_LEAVE`);
//         }
//         // Check for morning short leave
//         else if (morningShortLeaveFlag && workingMinutes >= minHalfDay && workingMinutes < minFullDay) {
//           finalStatus = "SHORT_LEAVE";
//           isHalfDay = true;
//           halfDayType = "SECOND_HALF";
//           needsDeduction = true;
//           deductionType = "SHORT_LEAVE";
//           console.log(`\n✅ Morning short leave detected → SHORT_LEAVE`);
//         }
//         else if (workingMinutes >= minFullDay) {
//           const hasShortLeave = morningShortLeaveFlag || eveningShortLeaveFlag;
//           finalStatus = hasShortLeave ? "SHORT_LEAVE" : "PRESENT";
//           isHalfDay = hasShortLeave ? true : false;
//           halfDayType = hasShortLeave ? "SECOND_HALF" : null;
//           needsDeduction = hasShortLeave ? true : false;
//           deductionType = hasShortLeave ? "SHORT_LEAVE" : null;
//           console.log(`\n✅ Worked full day (${workingMinutes}m) → ${finalStatus}`);
//         }
//         else if (workingMinutes >= minHalfDay) {
//           finalStatus = "HALF_DAY";
//           isHalfDay = true;
//           // Determine half day type based on which half was missed
//           if (firstPunch.isSameOrAfter(secondHalfStart)) {
//             halfDayType = "SECOND_HALF";
//           } else {
//             halfDayType = "FIRST_HALF";
//           }
//           needsDeduction = true;
//           deductionType = "HALF_DAY";
//           console.log(`\n⚠️ Worked half day (${workingMinutes}m) → HALF_DAY (${halfDayType})`);
//         }
//         else if (workingMinutes > 0) {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ Worked only ${workingMinutes}m (< half day) → ABSENT`);
//         }
//         else {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ No working minutes → ABSENT`);
//         }
//       }
//       // CASE D: Core status is ABSENT
//       else {
//         finalStatus = "ABSENT";
//         isHalfDay = false;
//         halfDayType = null;
//         needsDeduction = true;
//         deductionType = "FULL_DAY";
//         console.log(`\n❌ Core status is ABSENT → ABSENT`);
//       }
//     }

//     console.log(`\n🎯 Final Status: ${finalStatus}`);
//     console.log(`   Is Half Day: ${isHalfDay}`);
//     console.log(`   Half Day Type: ${halfDayType}`);
//     console.log(`   Needs Deduction: ${needsDeduction}`);
//     console.log(`   Deduction Type: ${deductionType}`);

//     // ================================================================
//     // CHECK IF LEAVE WAS AUTOMATICALLY DEDUCTED AND ADD BACK IF NEEDED
//     // ================================================================
//     let leaveAddedBack = false;
//     let leaveAdditionDetails = {};
//     let isLeaveAdjusted = false;

//     const attendanceStatus = (attendance.attendanceStatus || '').trim().toUpperCase();
//     const coreStatus = (attendance.coreAttendanceStatus || '').trim().toUpperCase();

//     console.log(`  ℹ️ Attendance Status: "${attendanceStatus}", Core Status: "${coreStatus}"`);
//     console.log(`  ℹ️ Attendance regularized: ${attendance.regularized || false}`);

//     const attendanceDayOfMonth = moment(attendance.date).date();

//     if ((attendanceStatus === "ABSENT" || coreStatus === "ABSENT") && !attendance.regularized) {
//       console.log(`  ℹ️ Attendance is marked as ABSENT and not regularized. Checking if leave was automatically deducted...`);

//       const month = moment(attendance.date).month() + 1;
//       const year = moment(attendance.date).year();

//       // ================================================================
//       // CHECK FOR SHORT LEAVE DEDUCTION FIRST
//       // ================================================================
//       let leaveWasDeducted = false;
//       let deductionAmount = 0;
//       let deductedFromSL = false;
//       let slBalanceFound = null;

//       // Get Short Leave (SL) type
//       const slLeaveTypeDoc = await LeaveType.findOne({ code: "SL" }).session(dbSession);

//       if (slLeaveTypeDoc) {
//         // Check SL balance for this month
//         const slBalance = await LeaveBalance.findOne({
//           employeeId: attendance.employee,
//           leaveTypeId: slLeaveTypeDoc._id,
//           month,
//           year
//         }).session(dbSession);

//         if (slBalance && slBalance.deductedDays && slBalance.deductedDays.includes(attendanceDayOfMonth)) {
//           leaveWasDeducted = true;
//           deductionAmount = 0.5;
//           deductedFromSL = true;
//           slBalanceFound = slBalance;
//           console.log(`  ℹ️ Short Leave (SL) deduction found: 0.5 day`);
//         }
//       }

//       // ================================================================
//       // IF NOT DEDUCTED FROM SL, CHECK EL BALANCE
//       // ================================================================
//       if (!leaveWasDeducted) {
//         const elLeaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(dbSession);

//         if (elLeaveTypeDoc) {
//           const elBalance = await LeaveBalance.findOne({
//             employeeId: attendance.employee,
//             leaveTypeId: elLeaveTypeDoc._id,
//             month,
//             year
//           }).session(dbSession);

//           if (elBalance && elBalance.deductedDays && elBalance.deductedDays.includes(attendanceDayOfMonth)) {
//             // Determine how much was deducted (full day or half day)
//             const originalAttendance = await Attendance.findById(attendance._id).session(dbSession);
//             if (originalAttendance && originalAttendance.isHalfDay) {
//               deductionAmount = 0.5;
//               console.log(`  ℹ️ Deduction was HALF DAY (0.5 day) from EL balance`);
//             } else {
//               deductionAmount = 1;
//               console.log(`  ℹ️ Deduction was FULL DAY (1 day) from EL balance`);
//             }
//             leaveWasDeducted = true;
//           }
//         }
//       }

//       // ================================================================
//       // IF NOT FOUND IN CURRENT MONTH, CHECK PREVIOUS MONTHS
//       // ================================================================
//       if (!leaveWasDeducted) {
//         // Check previous months for SL
//         if (slLeaveTypeDoc) {
//           const previousSLBalances = await getPreviousMonthsELBalances(
//             attendance.employee,
//             slLeaveTypeDoc._id,
//             month,
//             year,
//             12,
//             dbSession
//           );

//           for (const prevBalance of previousSLBalances) {
//             if (prevBalance.balance.deductedDays && prevBalance.balance.deductedDays.includes(attendanceDayOfMonth)) {
//               leaveWasDeducted = true;
//               deductionAmount = 0.5;
//               deductedFromSL = true;
//               slBalanceFound = prevBalance.balance;
//               console.log(`  ℹ️ Short Leave (SL) deduction found in ${prevBalance.month}/${prevBalance.year}: 0.5 day`);
//               break;
//             }
//           }
//         }

//         // If not found in SL, check EL in previous months
//         if (!leaveWasDeducted) {
//           const elLeaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(dbSession);
//           if (elLeaveTypeDoc) {
//             const previousELBalances = await getPreviousMonthsELBalances(
//               attendance.employee,
//               elLeaveTypeDoc._id,
//               month,
//               year,
//               12,
//               dbSession
//             );

//             for (const prevBalance of previousELBalances) {
//               if (prevBalance.balance.deductedDays && prevBalance.balance.deductedDays.includes(attendanceDayOfMonth)) {
//                 leaveWasDeducted = true;
//                 const originalAttendance = await Attendance.findById(attendance._id).session(dbSession);
//                 if (originalAttendance && originalAttendance.isHalfDay) {
//                   deductionAmount = 0.5;
//                 } else {
//                   deductionAmount = 1;
//                 }
//                 console.log(`  ℹ️ Deduction found in ${prevBalance.month}/${prevBalance.year}: ${deductionAmount} day(s)`);
//                 break;
//               }
//             }
//           }
//         }
//       }

//       // ================================================================
//       // REVERT THE DEDUCTION
//       // ================================================================
//       if (leaveWasDeducted && deductionAmount > 0) {
//         console.log(`  ℹ️ Leave was automatically deducted: ${deductionAmount} day(s). Adding back to balance...`);

//         let addBackResult = null;

//         if (deductedFromSL && slBalanceFound) {
//           // Revert from SL balance
//           console.log(`  ℹ️ Reverting from Short Leave (SL) balance...`);

//           // Reduce used and increase remaining
//           const reduceUsed = Math.min(slBalanceFound.used || 0, deductionAmount);
//           if (reduceUsed > 0) {
//             slBalanceFound.used = Math.max(0, slBalanceFound.used - reduceUsed);
//             slBalanceFound.remaining = (slBalanceFound.remaining || 0) + reduceUsed;
//             console.log(`  ✅ Reduced SL used by ${reduceUsed}, remaining now: ${slBalanceFound.remaining}`);
//           }

//           // Remove the day from deductedDays
//           if (slBalanceFound.deductedDays && slBalanceFound.deductedDays.includes(attendanceDayOfMonth)) {
//             slBalanceFound.deductedDays = slBalanceFound.deductedDays.filter(
//               (d) => d !== attendanceDayOfMonth
//             );
//             console.log(`  ✅ Removed day ${attendanceDayOfMonth} from SL deductedDays`);
//           }

//           await slBalanceFound.save({ session: dbSession });

//           leaveAddedBack = true;
//           isLeaveAdjusted = true;
//           addBackResult = {
//             success: true,
//             totalAddedBack: deductionAmount,
//             fromSL: true,
//             message: `Added back ${deductionAmount} day(s) from Short Leave balance`
//           };
//           leaveAdditionDetails = addBackResult;
//           console.log(`  ✅ ${deductionAmount} day(s) added back from Short Leave balance`);
//         } else {
//           // Revert from EL balance (existing logic)
//           const elLeaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(dbSession);

//           if (elLeaveTypeDoc) {
//             const currentMonthBalance = await LeaveBalance.findOne({
//               employeeId: attendance.employee,
//               leaveTypeId: elLeaveTypeDoc._id,
//               month,
//               year
//             }).session(dbSession);

//             if (currentMonthBalance) {
//               // Check for LOP reduction first
//               if (currentMonthBalance.lop && currentMonthBalance.lop > 0) {
//                 const reduceLop = Math.min(currentMonthBalance.lop, deductionAmount);
//                 currentMonthBalance.lop = Math.max(0, currentMonthBalance.lop - reduceLop);

//                 // Remove this day from deductedDays
//                 if (currentMonthBalance.deductedDays && currentMonthBalance.deductedDays.includes(attendanceDayOfMonth)) {
//                   currentMonthBalance.deductedDays = currentMonthBalance.deductedDays.filter(
//                     (d) => d !== attendanceDayOfMonth
//                   );
//                 }

//                 await currentMonthBalance.save({ session: dbSession });
//                 leaveAddedBack = true;
//                 isLeaveAdjusted = true;
//                 addBackResult = {
//                   success: true,
//                   message: `Reduced LOP by ${reduceLop} day(s)`,
//                   totalAddedBack: reduceLop,
//                   fromLOP: true
//                 };
//                 leaveAdditionDetails = addBackResult;
//                 console.log(`  ✅ Reduced LOP by ${reduceLop} day(s)`);
//               } else {
//                 // Try to add back to remaining balance
//                 const reduceUsed = Math.min(currentMonthBalance.used || 0, deductionAmount);
//                 if (reduceUsed > 0) {
//                   currentMonthBalance.used = Math.max(0, currentMonthBalance.used - reduceUsed);
//                   currentMonthBalance.remaining = (currentMonthBalance.remaining || 0) + reduceUsed;

//                   // Remove this day from deductedDays
//                   if (currentMonthBalance.deductedDays && currentMonthBalance.deductedDays.includes(attendanceDayOfMonth)) {
//                     currentMonthBalance.deductedDays = currentMonthBalance.deductedDays.filter(
//                       (d) => d !== attendanceDayOfMonth
//                     );
//                   }

//                   await currentMonthBalance.save({ session: dbSession });
//                   leaveAddedBack = true;
//                   isLeaveAdjusted = true;
//                   addBackResult = {
//                     success: true,
//                     message: `Added ${reduceUsed} day(s) back to remaining balance`,
//                     totalAddedBack: reduceUsed
//                   };
//                   leaveAdditionDetails = addBackResult;
//                   console.log(`  ✅ Added ${reduceUsed} day(s) back to remaining balance`);
//                 } else {
//                   // Check previous months for LOP
//                   const previousBalances = await getPreviousMonthsELBalances(
//                     attendance.employee,
//                     elLeaveTypeDoc._id,
//                     month,
//                     year,
//                     12,
//                     dbSession
//                   );

//                   for (const prevBalance of previousBalances) {
//                     if (prevBalance.balance.lop > 0) {
//                       const reduceLop = Math.min(prevBalance.balance.lop, deductionAmount);
//                       prevBalance.balance.lop = Math.max(0, prevBalance.balance.lop - reduceLop);

//                       if (prevBalance.balance.deductedDays && prevBalance.balance.deductedDays.includes(attendanceDayOfMonth)) {
//                         prevBalance.balance.deductedDays = prevBalance.balance.deductedDays.filter(
//                           (d) => d !== attendanceDayOfMonth
//                         );
//                       }

//                       await prevBalance.balance.save({ session: dbSession });
//                       leaveAddedBack = true;
//                       isLeaveAdjusted = true;
//                       addBackResult = {
//                         success: true,
//                         message: `Reduced LOP by ${reduceLop} day(s) from ${prevBalance.month}/${prevBalance.year}`,
//                         totalAddedBack: reduceLop,
//                         fromLOP: true,
//                         fromMonth: prevBalance.month,
//                         fromYear: prevBalance.year
//                       };
//                       leaveAdditionDetails = addBackResult;
//                       console.log(`  ✅ Reduced LOP by ${reduceLop} day(s) from ${prevBalance.month}/${prevBalance.year}`);
//                       break;
//                     }
//                   }
//                 }
//               }
//             } else {
//               console.log(`  ℹ️ No EL balance found for this month.`);
//             }
//           }
//         }

//         if (!leaveAddedBack) {
//           console.log(`  ⚠️ Could not add back leave balance. No sufficient balance found.`);
//           leaveAdditionDetails = {
//             success: false,
//             message: "Could not add back leave balance"
//           };
//         }
//       } else {
//         console.log(`  ℹ️ No automatic leave deduction found for this date.`);
//       }
//     } else {
//       console.log(`  ℹ️ Attendance is not ABSENT or already regularized. Status: "${attendanceStatus}", Regularized: ${attendance.regularized || false}`);
//     }

//     // ================================================================
//     // APPLY NEW LEAVE DEDUCTION BASED ON EVALUATOR LOGIC
//     // ================================================================
//     if (needsDeduction && deductionType) {
//       console.log(`  ℹ️ Applying new leave deduction based on evaluator logic...`);

//       let deductionResult = null;

//       if (deductionType === "HALF_DAY") {
//         console.log(`  ℹ️ Applying HALF DAY deduction (0.5 day)...`);
//         deductionResult = await deductHalfDayLeaveBalance(
//           attendance.employee,
//           attendance.date,
//           halfDayType || "FIRST_HALF",
//           "EL",
//           dbSession
//         );
//         if (deductionResult.success) {
//           console.log(`  ✅ Half day leave deducted successfully.`);
//         }
//       } else if (deductionType === "SHORT_LEAVE") {
//         console.log(`  ℹ️ Applying SHORT LEAVE deduction (0.5 day)...`);
//         // First try to deduct from SL balance
//         const slLeaveTypeDoc = await LeaveType.findOne({ code: "SL" }).session(dbSession);
//         let slDeductionSuccess = false;

//         if (slLeaveTypeDoc) {
//           const slBalance = await LeaveBalance.findOne({
//             employeeId: attendance.employee,
//             leaveTypeId: slLeaveTypeDoc._id,
//             month: moment(attendance.date).month() + 1,
//             year: moment(attendance.date).year()
//           }).session(dbSession);

//           if (slBalance && slBalance.remaining >= 0.5) {
//             // Deduct from SL balance
//             slBalance.used = (slBalance.used || 0) + 0.5;
//             slBalance.remaining = Math.max(0, (slBalance.remaining || 0) - 0.5);
//             slBalance.deductedDays = slBalance.deductedDays || [];
//             if (!slBalance.deductedDays.includes(moment(attendance.date).date())) {
//               slBalance.deductedDays.push(moment(attendance.date).date());
//             }
//             await slBalance.save({ session: dbSession });
//             slDeductionSuccess = true;
//             deductionResult = {
//               success: true,
//               message: "Short leave deducted from SL balance",
//               fromSL: true
//             };
//             console.log(`  ✅ Short leave deducted from SL balance (remaining: ${slBalance.remaining})`);
//           }
//         }

//         if (!slDeductionSuccess) {
//           // Fallback to EL balance (half day)
//           console.log(`  ℹ️ No SL balance available. Deducting from EL balance as HALF DAY...`);
//           deductionResult = await deductHalfDayLeaveBalance(
//             attendance.employee,
//             attendance.date,
//             "SECOND_HALF",
//             "EL",
//             dbSession
//           );
//           if (deductionResult.success) {
//             console.log(`  ✅ Short leave deducted from EL balance as half day.`);
//           }
//         }
//       } else if (deductionType === "FULL_DAY") {
//         console.log(`  ℹ️ Applying FULL DAY deduction (1 day)...`);
//         deductionResult = await deductLeaveBalanceForDate(
//           attendance.employee,
//           attendance.date,
//           "EL",
//           dbSession
//         );
//         if (deductionResult.success) {
//           console.log(`  ✅ Full day leave deducted successfully.`);
//         }
//       }

//       if (deductionResult) {
//         isLeaveAdjusted = true;
//         leaveAdditionDetails = {
//           ...leaveAdditionDetails,
//           deductionApplied: true,
//           deductionType: deductionType,
//           deductionResult: deductionResult
//         };
//       }
//     } else {
//       console.log(`  ℹ️ No leave deduction needed for this regularization.`);
//     }

//     // ================================================================
//     // UPDATE ATTENDANCE RECORD
//     // ================================================================

//     const requestType = regularization.requestType;

//     if (attendance.sessions.length === 0) {
//       attendance.sessions.push({
//         punchIn: finalPunchIn,
//         punchOut: finalPunchOut,
//         durationMinutes: Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60)),
//         manualPunchedOut: true,
//         punchOutLocation: {
//           address: "Regularized attendance"
//         },
//         punchInLocation: {
//           address: "Regularized attendance"
//         }
//       });
//       console.log(`  ✅ Created new session`);
//     } else {
//       const firstSession = attendance.sessions[0];

//       if (requestType === "MISSING_PUNCH_IN" || requestType === "MISSING_BOTH" || requestType === "ABSENT_MARKED") {
//         firstSession.punchIn = finalPunchIn;
//         firstSession.punchInLocation = firstSession.punchInLocation || {
//           address: "Regularized attendance"
//         };
//       }

//       if (requestType === "MISSING_PUNCH_OUT" || requestType === "MISSING_BOTH" || requestType === "ABSENT_MARKED") {
//         firstSession.punchOut = finalPunchOut;
//         firstSession.durationMinutes = Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60));
//         firstSession.manualPunchedOut = true;
//         firstSession.punchOutLocation = {
//           address: "Regularized attendance"
//         };
//       }

//       if (requestType === "WRONG_PUNCH_TIME") {
//         firstSession.punchIn = finalPunchIn;
//         firstSession.punchOut = finalPunchOut;
//         firstSession.durationMinutes = Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60));
//         firstSession.manualPunchedOut = true;
//         firstSession.punchInLocation = firstSession.punchInLocation || {
//           address: "Regularized attendance"
//         };
//         firstSession.punchOutLocation = {
//           address: "Regularized attendance"
//         };
//       }
//     }

//     // attendance.firstPunchIn = attendance.sessions[0]?.punchIn || finalPunchIn;
//     // attendance.lastPunchOut = attendance.sessions[attendance.sessions.length - 1]?.punchOut || finalPunchOut;
//     attendance.totalWorkingMinutes = attendance.sessions.reduce(
//       (sum, s) => sum + (s.durationMinutes || 0), 0
//     );

//     attendance.regularized = true;
//     attendance.regularizationRequestId = regularizationId;
//     attendance.regularizedAt = new Date();
//     attendance.regularizedBy = approvedBy;

//     attendance.attendanceStatus = finalStatus;
//     attendance.coreAttendanceStatus = finalStatus;
//     attendance.status = finalStatus === "PRESENT" || finalStatus === "ON_LEAVE" ? "PRESENT" : "ABSENT";
//     attendance.isHalfDay = isHalfDay;
//     attendance.halfDayType = halfDayType;
//     attendance.isLate = false;
//     attendance.lateMinutes = 0;
//     attendance.isEarlyLeave = false;
//     attendance.earlyLeaveMinutes = 0;

//     const remarks = `Regularized by ${approvedBy} on ${new Date().toISOString()}. Punch In: ${moment(finalPunchIn).format('HH:mm')}, Punch Out: ${moment(finalPunchOut).format('HH:mm')}. Status: ${finalStatus}${isHalfDay ? ` (${halfDayType})` : ''}. ${approvalRemark || ''}`;
//     attendance.remarks = attendance.remarks
//       ? `${attendance.remarks} | ${remarks}`
//       : remarks;

//     await attendance.save({ session: dbSession });
//     console.log(`  ✅ Attendance record updated with status: ${finalStatus}`);

//     // ================================================================
//     // UPDATE REGULARIZATION REQUEST
//     // ================================================================
//     regularization.status = "APPROVED";
//     regularization.approvedBy = approvedBy;
//     regularization.approvedAt = new Date();
//     regularization.approvalRemark = approvalRemark || "Regularization approved";
//     regularization.approvedPunchIn = finalPunchIn;
//     regularization.approvedPunchOut = finalPunchOut;
//     regularization.isLeaveAdjusted = isLeaveAdjusted;

//     await regularization.save({ session: dbSession });
//     console.log(`  ✅ Regularization request approved`);

//     await dbSession.commitTransaction();
//     dbSession.endSession();

//     return {
//       success: true,
//       message: "Regularization request approved successfully",
//       data: {
//         regularization,
//         attendance,
//         leaveAddedBack,
//         leaveAdditionDetails,
//         finalStatus,
//         isHalfDay,
//         halfDayType,
//         needsDeduction,
//         deductionType
//       }
//     };

//   } catch (error) {
//     await dbSession.abortTransaction();
//     dbSession.endSession();
//     console.error("Error in approveRegularization:", error);
//     throw error;
//   }
// };

// ============================================================================
// ADD LEAVE BALANCE BACK WITH SPECIFIC AMOUNT
// ============================================================================
const addLeaveBalanceBackWithAmount = async (employeeId, date, amount, session = null) => {
  try {
    console.log(`  ℹ️ Adding back ${amount} day(s) for ${moment(date).format('YYYY-MM-DD')}`);

    const leaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(session);
    if (!leaveTypeDoc) {
      console.log(`  ⚠️ Leave type "EL" not found.`);
      return { success: false, message: "Leave type not found" };
    }

    const month = moment(date).month() + 1;
    const year = moment(date).year();
    const dayOfMonth = moment(date).date();

    let balance = await LeaveBalance.findOne({
      employeeId: employeeId,
      leaveTypeId: leaveTypeDoc._id,
      month,
      year,
    }).session(session);

    if (!balance) {
      console.log(`  ℹ️ No leave balance found. Nothing to add back.`);
      return { success: true, totalAddedBack: 0 };
    }

    let remainingToAdd = amount;
    let totalAddedBack = 0;

    // First, try to reduce LOP
    if (balance.lop && balance.lop > 0) {
      const reduceLop = Math.min(balance.lop, remainingToAdd);
      balance.lop = Math.max(0, balance.lop - reduceLop);
      totalAddedBack += reduceLop;
      remainingToAdd -= reduceLop;
      console.log(`  ✅ Reduced LOP by ${reduceLop} day(s)`);
    }

    // Then, try to add back to remaining balance
    if (remainingToAdd > 0) {
      // Check if we can add to remaining by reducing used
      const reduceUsed = Math.min(balance.used, remainingToAdd);
      if (reduceUsed > 0) {
        balance.used = Math.max(0, balance.used - reduceUsed);
        balance.remaining = balance.remaining + reduceUsed;
        totalAddedBack += reduceUsed;
        remainingToAdd -= reduceUsed;
        console.log(`  ✅ Added ${reduceUsed} day(s) back to remaining balance`);
      }
    }

    // Remove this day from deductedDays
    if (balance.deductedDays && balance.deductedDays.includes(dayOfMonth)) {
      balance.deductedDays = balance.deductedDays.filter(
        (d) => d !== dayOfMonth
      );
      console.log(`  ✅ Removed day ${dayOfMonth} from deductedDays`);
    }

    await balance.save({ session });

    console.log(`  ✅ Leave balance updated: used=${balance.used}, remaining=${balance.remaining}, lop=${balance.lop || 0}`);

    return {
      success: true,
      totalAddedBack: totalAddedBack,
      balance
    };

  } catch (error) {
    console.error(`  ❌ Error adding leave balance back:`, error.message);
    return { success: false, message: error.message };
  }
};

// const approveRegularization = async (data) => {
//   const dbSession = await mongoose.startSession();
//   dbSession.startTransaction();

//   try {
//     const {
//       regularizationId,
//       approvedBy,
//       approvalRemark,
//       approvedPunchIn,
//       approvedPunchOut
//     } = data;

//     // Find regularization request
//     const regularization = await AttendanceRegularization.findById(regularizationId)
//       .populate('attendanceId')
//       .populate('employeeId')
//       .session(dbSession);

//     if (!regularization) {
//       await dbSession.abortTransaction();
//       dbSession.endSession();
//       return {
//         success: false,
//         message: "Regularization request not found"
//       };
//     }

//     if (regularization.status !== "PENDING") {
//       await dbSession.abortTransaction();
//       dbSession.endSession();
//       return {
//         success: false,
//         message: `Cannot approve a ${regularization.status.toLowerCase()} request`
//       };
//     }

//     const attendance = await Attendance.findById(regularization.attendanceId._id)
//       .session(dbSession);

//     if (!attendance) {
//       await dbSession.abortTransaction();
//       dbSession.endSession();
//       return {
//         success: false,
//         message: "Attendance record not found"
//       };
//     }

//     // ================================================================
//     // DETERMINE APPROVED PUNCH TIMES
//     // ================================================================
//     const finalPunchIn = approvedPunchIn || regularization.requestedPunchIn || attendance.date;
//     const finalPunchOut = approvedPunchOut || regularization.requestedPunchOut ||
//       new Date(new Date(finalPunchIn).getTime() + 8 * 60 * 60 * 1000);

//     // ================================================================
//     // EXACT SAME LOGIC AS evaluateAttendance FUNCTION
//     // ================================================================

//     // Office timing constants (same as evaluateAttendance)
//     const OFFICE_START = "09:31";
//     const GRACE_END = "09:46";
//     const MORNING_SHORT_LEAVE_END = "11:46";
//     const FIRST_HALF_END = "14:01";
//     const SECOND_HALF_START = "14:01";
//     const SECOND_HALF_GRACE_END = "14:16";
//     const EVENING_SHORT_LEAVE_START = "16:30";
//     const OFFICE_END = "18:30";

//     const toLocalTime = (utcDate) => moment(utcDate).utcOffset("+05:30");

//     const getLocalMomentTime = (baseDay, timeString) => {
//       const [hours, minutes] = timeString.split(":").map(Number);
//       return moment(baseDay).utcOffset("+05:30").hour(hours).minute(minutes).second(0).millisecond(0);
//     };

//     // Get first punch (approved punch in) and last punch (approved punch out)
//     const day = moment(attendance.date).utcOffset("+05:30").startOf("day");
//     const firstPunch = toLocalTime(finalPunchIn);
//     const lastPunch = toLocalTime(finalPunchOut);

//     console.log(`  ℹ️ Approved First Punch: ${firstPunch.format("HH:mm:ss")}`);
//     console.log(`  ℹ️ Approved Last Punch: ${lastPunch.format("HH:mm:ss")}`);

//     // Shift boundaries (same as evaluateAttendance)
//     const shiftStart = getLocalMomentTime(day, OFFICE_START);
//     const graceEnd = getLocalMomentTime(day, GRACE_END);
//     const morningShortEnd = getLocalMomentTime(day, MORNING_SHORT_LEAVE_END);
//     const firstHalfEnd = getLocalMomentTime(day, FIRST_HALF_END);
//     const secondHalfStart = getLocalMomentTime(day, SECOND_HALF_START);
//     const secondHalfGraceEnd = getLocalMomentTime(day, SECOND_HALF_GRACE_END);
//     const eveningShortStart = getLocalMomentTime(day, EVENING_SHORT_LEAVE_START);
//     const shiftEnd = getLocalMomentTime(day, OFFICE_END);

//     // Monthly late count (same as evaluateAttendance)
//     const monthKey = moment(attendance.date).format("YYYY-MM");
//     const employee = await Employee.findById(attendance.employee).session(dbSession);
//     const monthLateCount = employee?.lateCounts?.find((m) => m.month === monthKey)?.count || 0;
//     const maxLateAllowed = 3; // Default from policy

//     console.log(`  ℹ️ Monthly late used: ${monthLateCount}/${maxLateAllowed}`);

//     // ================================================================
//     // DETERMINE CORE STATUS (EXACT SAME AS evaluateAttendance)
//     // ================================================================

//     // Check if arrived after 2:15 PM
//     if (firstPunch.isAfter(secondHalfGraceEnd)) {
//       console.log(`  ❌ Arrived after 2:15 PM → ABSENT`);
//       finalStatus = "ABSENT";
//       isHalfDay = false;
//       halfDayType = null;
//       needsDeduction = true;
//       deductionType = "FULL_DAY";
//     } else {
//       // Determine core status by first punch
//       let coreStatus = "PRESENT";
//       let coreHalfDayType = null;
//       let morningShortLeaveFlag = false;
//       let morningShortLeaveMinutes = 0;

//       console.log(`\n🔍 Determining CORE status from first punch: ${firstPunch.format("HH:mm:ss")}`);

//       // Case 1: Arrived after 2:15 PM (already handled above)
//       // Case 2: Arrived between 11:45 - 14:00 (First Half Day)
//       if (firstPunch.isAfter(morningShortEnd) && firstPunch.isBefore(secondHalfStart)) {
//         coreStatus = "HALF_DAY";
//         coreHalfDayType = "FIRST_HALF";
//         console.log(`   → CORE = HALF_DAY (FIRST_HALF)`);
//       }
//       // Case 3: Arrived between 14:00 - 14:15 (Second Half Day)
//       else if (firstPunch.isSameOrAfter(secondHalfStart) && firstPunch.isSameOrBefore(secondHalfGraceEnd)) {
//         coreStatus = "HALF_DAY";
//         coreHalfDayType = "SECOND_HALF";
//         console.log(`   → CORE = HALF_DAY (SECOND_HALF)`);
//       }
//       // Case 4: Arrived after shift start but before 11:45
//       else if (firstPunch.isAfter(shiftStart)) {
//         const lateMins = firstPunch.diff(shiftStart, "minutes");

//         // Grace period (09:30 - 09:45) with exceeded limit
//         if (firstPunch.isSameOrBefore(graceEnd) && monthLateCount >= maxLateAllowed) {
//           coreStatus = "SHORT_LEAVE";
//           morningShortLeaveFlag = true;
//           morningShortLeaveMinutes = lateMins;
//           console.log(`   → CORE = SHORT_LEAVE (grace arrival, limit exceeded)`);
//         }
//         // Short leave window (09:45 - 11:45)
//         else if (firstPunch.isAfter(graceEnd) && firstPunch.isSameOrBefore(morningShortEnd)) {
//           coreStatus = "SHORT_LEAVE";
//           morningShortLeaveFlag = true;
//           morningShortLeaveMinutes = lateMins;
//           console.log(`   → CORE = SHORT_LEAVE (short leave window)`);
//         }
//       }

//       console.log(`  ℹ️ Core Status: ${coreStatus}`);

//       // ================================================================
//       // CHECK EVENING SHORT LEAVE (EXACT SAME AS evaluateAttendance)
//       // ================================================================
//       let eveningShortLeaveFlag = false;
//       let eveningShortLeaveMinutes = 0;

//       if (lastPunch.isSameOrAfter(eveningShortStart) && lastPunch.isBefore(shiftEnd)) {
//         const shortLeaveMins = shiftEnd.diff(lastPunch, "minutes");
//         if (shortLeaveMins > 0 && shortLeaveMins <= 120) {
//           eveningShortLeaveFlag = true;
//           eveningShortLeaveMinutes = shortLeaveMins;
//           console.log(`  ℹ️ Evening short leave: ${shortLeaveMins} min`);
//         }
//       }

//       // ================================================================
//       // DETERMINE FINAL STATUS (EXACT SAME AS evaluateAttendance)
//       // ================================================================

//       const workingMinutes = Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60));
//       console.log(`  ℹ️ Total working minutes: ${workingMinutes}`);

//       // Get policy thresholds
//       const minFullDay = 480; // 8 hours
//       const minHalfDay = 240; // 4 hours

//       // Rule 1: If there's an active session (not applicable for regularization)
//       // Rule 2: No active session - evaluate based on working minutes and flags

//       // CASE A: Core status is HALF_DAY
//       if (coreStatus === "HALF_DAY") {
//         if (workingMinutes < 30) {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ Core is HALF_DAY but worked only ${workingMinutes}m (< 30) → ABSENT`);
//         } else {
//           finalStatus = "HALF_DAY";
//           isHalfDay = true;
//           halfDayType = coreHalfDayType || "FIRST_HALF";
//           needsDeduction = true;
//           deductionType = "HALF_DAY";
//           console.log(`\n✅ Core is HALF_DAY, worked ${workingMinutes}m → HALF_DAY`);
//         }
//       }
//       // CASE B: Core status is SHORT_LEAVE
//       else if (coreStatus === "SHORT_LEAVE") {
//         if (workingMinutes >= minFullDay) {
//           finalStatus = "SHORT_LEAVE";
//           isHalfDay = true;
//           halfDayType = "SECOND_HALF";
//           needsDeduction = true;
//           deductionType = "SHORT_LEAVE";
//           console.log(`\n✅ Worked full day (${workingMinutes}m) → SHORT_LEAVE`);
//         } else if (workingMinutes >= minHalfDay) {
//           finalStatus = "SHORT_LEAVE";
//           isHalfDay = true;
//           halfDayType = "SECOND_HALF";
//           needsDeduction = true;
//           deductionType = "SHORT_LEAVE";
//           console.log(`\n✅ Worked half day (${workingMinutes}m) → SHORT_LEAVE`);
//         } else if (workingMinutes > 0) {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ Worked only ${workingMinutes}m (< half day) → ABSENT`);
//         } else {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ No working minutes → ABSENT`);
//         }
//       }
//       // CASE C: Core status is PRESENT
//       else if (coreStatus === "PRESENT") {
//         // IMPORTANT: Check for evening short leave first
//         if (eveningShortLeaveFlag && workingMinutes >= minHalfDay && workingMinutes < minFullDay) {
//           finalStatus = "SHORT_LEAVE";
//           isHalfDay = true;
//           halfDayType = "SECOND_HALF";
//           needsDeduction = true;
//           deductionType = "SHORT_LEAVE";
//           console.log(`\n✅ Evening short leave detected (left at ${lastPunch.format("HH:mm:ss")}) → SHORT_LEAVE`);
//         }
//         // Check for morning short leave
//         else if (morningShortLeaveFlag && workingMinutes >= minHalfDay && workingMinutes < minFullDay) {
//           finalStatus = "SHORT_LEAVE";
//           isHalfDay = true;
//           halfDayType = "SECOND_HALF";
//           needsDeduction = true;
//           deductionType = "SHORT_LEAVE";
//           console.log(`\n✅ Morning short leave detected → SHORT_LEAVE`);
//         }
//         else if (workingMinutes >= minFullDay) {
//           const hasShortLeave = morningShortLeaveFlag || eveningShortLeaveFlag;
//           finalStatus = hasShortLeave ? "SHORT_LEAVE" : "PRESENT";
//           isHalfDay = hasShortLeave ? true : false;
//           halfDayType = hasShortLeave ? "SECOND_HALF" : null;
//           needsDeduction = hasShortLeave ? true : false;
//           deductionType = hasShortLeave ? "SHORT_LEAVE" : null;
//           console.log(`\n✅ Worked full day (${workingMinutes}m) → ${finalStatus}`);
//         }
//         else if (workingMinutes >= minHalfDay) {
//           finalStatus = "HALF_DAY";
//           isHalfDay = true;
//           // Determine half day type based on which half was missed
//           // Check if punch in is after second half start (afternoon shift)
//           if (firstPunch.isSameOrAfter(secondHalfStart)) {
//             halfDayType = "SECOND_HALF";
//           } else {
//             halfDayType = "FIRST_HALF";
//           }
//           needsDeduction = true;
//           deductionType = "HALF_DAY";
//           console.log(`\n⚠️ Worked half day (${workingMinutes}m) → HALF_DAY (${halfDayType})`);
//         }
//         else if (workingMinutes > 0) {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ Worked only ${workingMinutes}m (< half day) → ABSENT`);
//         }
//         else {
//           finalStatus = "ABSENT";
//           isHalfDay = false;
//           halfDayType = null;
//           needsDeduction = true;
//           deductionType = "FULL_DAY";
//           console.log(`\n❌ No working minutes → ABSENT`);
//         }
//       }
//       // CASE D: Core status is ABSENT
//       else {
//         finalStatus = "ABSENT";
//         isHalfDay = false;
//         halfDayType = null;
//         needsDeduction = true;
//         deductionType = "FULL_DAY";
//         console.log(`\n❌ Core status is ABSENT → ABSENT`);
//       }
//     }

//     console.log(`\n🎯 Final Status: ${finalStatus}`);
//     console.log(`   Is Half Day: ${isHalfDay}`);
//     console.log(`   Half Day Type: ${halfDayType}`);
//     console.log(`   Needs Deduction: ${needsDeduction}`);
//     console.log(`   Deduction Type: ${deductionType}`);

//     // ================================================================
//     // CHECK IF LEAVE WAS AUTOMATICALLY DEDUCTED AND ADD BACK IF NEEDED
//     // ================================================================
//     let leaveAddedBack = false;
//     let leaveAdditionDetails = {};
//     let isLeaveAdjusted = false;

//     const attendanceStatus = (attendance.attendanceStatus || '').trim().toUpperCase();
//     const coreStatus = (attendance.coreAttendanceStatus || '').trim().toUpperCase();

//     console.log(`  ℹ️ Attendance Status: "${attendanceStatus}", Core Status: "${coreStatus}"`);
//     console.log(`  ℹ️ Attendance regularized: ${attendance.regularized || false}`);

//     const attendanceDayOfMonth = moment(attendance.date).date();

//     if ((attendanceStatus === "ABSENT" || coreStatus === "ABSENT") && !attendance.regularized) {
//       console.log(`  ℹ️ Attendance is marked as ABSENT and not regularized. Checking if leave was automatically deducted...`);

//       const month = moment(attendance.date).month() + 1;
//       const year = moment(attendance.date).year();

//       const leaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(dbSession);

//       if (leaveTypeDoc) {
//         let leaveWasDeducted = false;

//         const currentMonthBalance = await LeaveBalance.findOne({
//           employeeId: attendance.employee,
//           leaveTypeId: leaveTypeDoc._id,
//           month,
//           year
//         }).session(dbSession);

//         if (currentMonthBalance) {
//           if ((currentMonthBalance.used || 0) > 0 || (currentMonthBalance.lop || 0) > 0) {
//             const leavesInMonth = await Leave.find({
//               employee: attendance.employee,
//               status: { $in: ["APPROVED", "PENDING"] },
//               $or: [
//                 {
//                   startDate: {
//                     $gte: moment(attendance.date).startOf('month').toDate(),
//                     $lte: moment(attendance.date).endOf('month').toDate()
//                   }
//                 },
//                 {
//                   endDate: {
//                     $gte: moment(attendance.date).startOf('month').toDate(),
//                     $lte: moment(attendance.date).endOf('month').toDate()
//                   }
//                 }
//               ]
//             }).session(dbSession);

//             let coveredByManualLeave = false;
//             const attendanceDateStr = moment(attendance.date).format('YYYY-MM-DD');

//             for (const leave of leavesInMonth) {
//               const leaveStartStr = moment(leave.startDate).format('YYYY-MM-DD');
//               const leaveEndStr = leave.endDate ? moment(leave.endDate).format('YYYY-MM-DD') : leaveStartStr;

//               if (attendanceDateStr >= leaveStartStr && attendanceDateStr <= leaveEndStr) {
//                 coveredByManualLeave = true;
//                 break;
//               }
//             }

//             if (!coveredByManualLeave) {
//               leaveWasDeducted = true;
//             }
//           }
//         }

//         if (leaveWasDeducted) {
//           console.log(`  ℹ️ Leave was automatically deducted. Adding back to balance...`);

//           const addBackResult = await addLeaveBalanceBack(
//             attendance.employee,
//             attendance.date,
//             dbSession
//           );

//           if (addBackResult.success && addBackResult.totalAddedBack > 0) {
//             leaveAddedBack = true;
//             isLeaveAdjusted = true;
//             leaveAdditionDetails = addBackResult;
//             console.log(`  ✅ Leave balance added back successfully`);
//           } else {
//             // Check for LOP
//             if (currentMonthBalance && currentMonthBalance.lop > 0) {
//               currentMonthBalance.lop = Math.max(0, currentMonthBalance.lop - 1);
//               if (currentMonthBalance.deductedDays && currentMonthBalance.deductedDays.includes(attendanceDayOfMonth)) {
//                 currentMonthBalance.deductedDays = currentMonthBalance.deductedDays.filter(
//                   (d) => d !== attendanceDayOfMonth
//                 );
//               }
//               await currentMonthBalance.save({ session: dbSession });
//               leaveAddedBack = true;
//               isLeaveAdjusted = true;
//               leaveAdditionDetails = {
//                 success: true,
//                 message: "Reduced LOP by 1 day",
//                 totalAddedBack: 1,
//                 fromLOP: true
//               };
//               console.log(`  ✅ Reduced LOP by 1 day`);
//             }
//           }
//         }
//       }
//     }

//     // ================================================================
//     // APPLY NEW LEAVE DEDUCTION BASED ON EVALUATOR LOGIC
//     // ================================================================
//     if (needsDeduction && deductionType) {
//       console.log(`  ℹ️ Applying new leave deduction based on evaluator logic...`);

//       let deductionResult = null;

//       if (deductionType === "HALF_DAY") {
//         console.log(`  ℹ️ Applying HALF DAY deduction (0.5 day)...`);
//         deductionResult = await deductHalfDayLeaveBalance(
//           attendance.employee,
//           attendance.date,
//           halfDayType || "FIRST_HALF",
//           "EL",
//           dbSession
//         );
//         if (deductionResult.success) {
//           console.log(`  ✅ Half day leave deducted successfully.`);
//         }
//       } else if (deductionType === "SHORT_LEAVE") {
//         console.log(`  ℹ️ Applying SHORT LEAVE deduction (0.5 day)...`);
//         deductionResult = await deductHalfDayLeaveBalance(
//           attendance.employee,
//           attendance.date,
//           "SECOND_HALF",
//           "EL",
//           dbSession
//         );
//         if (deductionResult.success) {
//           console.log(`  ✅ Short leave deducted successfully.`);
//         }
//       } else if (deductionType === "FULL_DAY") {
//         console.log(`  ℹ️ Applying FULL DAY deduction (1 day)...`);
//         deductionResult = await deductLeaveBalanceForDate(
//           attendance.employee,
//           attendance.date,
//           "EL",
//           dbSession
//         );
//         if (deductionResult.success) {
//           console.log(`  ✅ Full day leave deducted successfully.`);
//         }
//       }

//       if (deductionResult) {
//         isLeaveAdjusted = true;
//         leaveAdditionDetails = {
//           ...leaveAdditionDetails,
//           deductionApplied: true,
//           deductionType: deductionType,
//           deductionResult: deductionResult
//         };
//       }
//     } else {
//       console.log(`  ℹ️ No leave deduction needed for this regularization.`);
//     }

//     // ================================================================
//     // UPDATE ATTENDANCE RECORD
//     // ================================================================

//     const requestType = regularization.requestType;

//     if (attendance.sessions.length === 0) {
//       attendance.sessions.push({
//         punchIn: finalPunchIn,
//         punchOut: finalPunchOut,
//         durationMinutes: Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60)),
//         manualPunchedOut: true,
//         punchOutLocation: {
//           address: "Regularized attendance"
//         },
//         punchInLocation: {
//           address: "Regularized attendance"
//         }
//       });
//       console.log(`  ✅ Created new session`);
//     } else {
//       const firstSession = attendance.sessions[0];

//       if (requestType === "MISSING_PUNCH_IN" || requestType === "MISSING_BOTH" || requestType === "ABSENT_MARKED") {
//         firstSession.punchIn = finalPunchIn;
//         firstSession.punchInLocation = firstSession.punchInLocation || {
//           address: "Regularized attendance"
//         };
//       }

//       if (requestType === "MISSING_PUNCH_OUT" || requestType === "MISSING_BOTH" || requestType === "ABSENT_MARKED") {
//         firstSession.punchOut = finalPunchOut;
//         firstSession.durationMinutes = Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60));
//         firstSession.manualPunchedOut = true;
//         firstSession.punchOutLocation = {
//           address: "Regularized attendance"
//         };
//       }

//       if (requestType === "WRONG_PUNCH_TIME") {
//         firstSession.punchIn = finalPunchIn;
//         firstSession.punchOut = finalPunchOut;
//         firstSession.durationMinutes = Math.floor((new Date(finalPunchOut) - new Date(finalPunchIn)) / (1000 * 60));
//         firstSession.manualPunchedOut = true;
//         firstSession.punchInLocation = firstSession.punchInLocation || {
//           address: "Regularized attendance"
//         };
//         firstSession.punchOutLocation = {
//           address: "Regularized attendance"
//         };
//       }
//     }

//     attendance.firstPunchIn = attendance.sessions[0]?.punchIn || finalPunchIn;
//     attendance.lastPunchOut = attendance.sessions[attendance.sessions.length - 1]?.punchOut || finalPunchOut;
//     attendance.totalWorkingMinutes = attendance.sessions.reduce(
//       (sum, s) => sum + (s.durationMinutes || 0), 0
//     );

//     attendance.regularized = true;
//     attendance.regularizationRequestId = regularizationId;
//     attendance.regularizedAt = new Date();
//     attendance.regularizedBy = approvedBy;

//     attendance.attendanceStatus = finalStatus;
//     attendance.coreAttendanceStatus = finalStatus;
//     attendance.status = finalStatus === "PRESENT" || finalStatus === "ON_LEAVE" ? "PRESENT" : "ABSENT";
//     attendance.isHalfDay = isHalfDay;
//     attendance.halfDayType = halfDayType;
//     attendance.isLate = false;
//     attendance.lateMinutes = 0;
//     attendance.isEarlyLeave = false;
//     attendance.earlyLeaveMinutes = 0;

//     const remarks = `Regularized by ${approvedBy} on ${new Date().toISOString()}. Punch In: ${moment(finalPunchIn).format('HH:mm')}, Punch Out: ${moment(finalPunchOut).format('HH:mm')}. Status: ${finalStatus}${isHalfDay ? ` (${halfDayType})` : ''}. ${approvalRemark || ''}`;
//     attendance.remarks = attendance.remarks
//       ? `${attendance.remarks} | ${remarks}`
//       : remarks;

//     await attendance.save({ session: dbSession });
//     console.log(`  ✅ Attendance record updated with status: ${finalStatus}`);

//     // ================================================================
//     // UPDATE REGULARIZATION REQUEST
//     // ================================================================
//     regularization.status = "APPROVED";
//     regularization.approvedBy = approvedBy;
//     regularization.approvedAt = new Date();
//     regularization.approvalRemark = approvalRemark || "Regularization approved";
//     regularization.approvedPunchIn = finalPunchIn;
//     regularization.approvedPunchOut = finalPunchOut;
//     regularization.isLeaveAdjusted = isLeaveAdjusted;

//     await regularization.save({ session: dbSession });
//     console.log(`  ✅ Regularization request approved`);

//     await dbSession.commitTransaction();
//     dbSession.endSession();

//     return {
//       success: true,
//       message: "Regularization request approved successfully",
//       data: {
//         regularization,
//         attendance,
//         leaveAddedBack,
//         leaveAdditionDetails,
//         finalStatus,
//         isHalfDay,
//         halfDayType,
//         needsDeduction,
//         deductionType
//       }
//     };

//   } catch (error) {
//     await dbSession.abortTransaction();
//     dbSession.endSession();
//     console.error("Error in approveRegularization:", error);
//     throw error;
//   }
// };

// const approveRegularization = async (data) => {
//   const dbSession = await mongoose.startSession();
//   dbSession.startTransaction();

//   try {
//     const {
//       regularizationId,
//       approvedBy,
//       approvalRemark,
//       approvedPunchIn,
//       approvedPunchOut
//     } = data;

//     // Find regularization request
//     const regularization = await AttendanceRegularization.findById(regularizationId)
//       .populate('attendanceId')
//       .populate('employeeId')
//       .session(dbSession);

//     if (!regularization) {
//       await dbSession.abortTransaction();
//       dbSession.endSession();
//       return {
//         success: false,
//         message: "Regularization request not found"
//       };
//     }

//     if (regularization.status !== "PENDING") {
//       await dbSession.abortTransaction();
//       dbSession.endSession();
//       return {
//         success: false,
//         message: `Cannot approve a ${regularization.status.toLowerCase()} request`
//       };
//     }

//     const attendance = await Attendance.findById(regularization.attendanceId._id)
//       .session(dbSession);

//     if (!attendance) {
//       await dbSession.abortTransaction();
//       dbSession.endSession();
//       return {
//         success: false,
//         message: "Attendance record not found"
//       };
//     }

//     // ================================================================
//     // CHECK IF LEAVE WAS AUTOMATICALLY DEDUCTED AND ADD BACK IF NEEDED
//     // ================================================================
//     let leaveAddedBack = false;
//     let leaveAdditionDetails = {};
//     let isLeaveAdjusted = false;

//     // Get the attendance status (trim to handle any whitespace issues)
//     const attendanceStatus = (attendance.attendanceStatus || '').trim().toUpperCase();
//     const coreStatus = (attendance.coreAttendanceStatus || '').trim().toUpperCase();

//     console.log(`  ℹ️ Attendance Status: "${attendanceStatus}", Core Status: "${coreStatus}"`);
//     console.log(`  ℹ️ Attendance regularized: ${attendance.regularized || false}`);
//     console.log(`  ℹ️ Request Type: ${regularization.requestType}`);

//     // Day-of-month for this attendance date, used to remove it from
//     // deductedDays on whichever balance ends up being adjusted below.
//     const attendanceDayOfMonth = moment(attendance.date).date();

//     // Check if attendance was marked as ABSENT (which means leave was automatically deducted)
//     // Also check if it's NOT already regularized
//     if ((attendanceStatus === "ABSENT" || coreStatus === "ABSENT") && !attendance.regularized) {
//       console.log(`  ℹ️ Attendance is marked as ABSENT and not regularized. Checking if leave was automatically deducted...`);

//       // Get the month and year of the attendance date
//       const month = moment(attendance.date).month() + 1;
//       const year = moment(attendance.date).year();

//       console.log(`  ℹ️ Attendance Date: ${moment(attendance.date).format('YYYY-MM-DD')}, Month: ${month}, Year: ${year}`);

//       // Get EL leave type
//       const leaveTypeDoc = await LeaveType.findOne({ code: "EL" }).session(dbSession);

//       if (leaveTypeDoc) {
//         let leaveWasDeducted = false;
//         let deductionFoundIn = null;

//         // STEP 1: Check current month's balance
//         const currentMonthBalance = await LeaveBalance.findOne({
//           employeeId: attendance.employee,
//           leaveTypeId: leaveTypeDoc._id,
//           month,
//           year
//         }).session(dbSession);

//         if (currentMonthBalance) {
//           console.log(`  ℹ️ Current month balance - Used: ${currentMonthBalance.used || 0}, LOP: ${currentMonthBalance.lop || 0}, Remaining: ${currentMonthBalance.remaining || 0}`);

//           // Check if there's any used leave or LOP in current month
//           if ((currentMonthBalance.used || 0) > 0 || (currentMonthBalance.lop || 0) > 0) {
//             // Check if there are any approved/pending leaves in this month
//             const leavesInMonth = await Leave.find({
//               employee: attendance.employee,
//               status: { $in: ["APPROVED", "PENDING"] },
//               $or: [
//                 {
//                   startDate: {
//                     $gte: moment(attendance.date).startOf('month').toDate(),
//                     $lte: moment(attendance.date).endOf('month').toDate()
//                   }
//                 },
//                 {
//                   endDate: {
//                     $gte: moment(attendance.date).startOf('month').toDate(),
//                     $lte: moment(attendance.date).endOf('month').toDate()
//                   }
//                 }
//               ]
//             }).session(dbSession);

//             console.log(`  ℹ️ Found ${leavesInMonth.length} approved/pending leaves in this month`);

//             // Check if this attendance date falls within any manual leave
//             let coveredByManualLeave = false;
//             const attendanceDateStr = moment(attendance.date).format('YYYY-MM-DD');

//             for (const leave of leavesInMonth) {
//               const leaveStartStr = moment(leave.startDate).format('YYYY-MM-DD');
//               const leaveEndStr = leave.endDate ? moment(leave.endDate).format('YYYY-MM-DD') : leaveStartStr;

//               if (attendanceDateStr >= leaveStartStr && attendanceDateStr <= leaveEndStr) {
//                 coveredByManualLeave = true;
//                 console.log(`  ℹ️ Attendance date falls within manual leave: ${leave._id} (${leaveStartStr} to ${leaveEndStr})`);
//                 break;
//               }
//             }

//             // If not covered by manual leave, it's automatic deduction
//             if (!coveredByManualLeave) {
//               leaveWasDeducted = true;
//               deductionFoundIn = 'current_month';
//               console.log(`  ✅ Leave was automatically deducted from current month balance.`);
//             } else {
//               console.log(`  ℹ️ Attendance is covered by manual leave. No automatic deduction to add back.`);
//             }
//           }
//         }

//         // STEP 2: If not found in current month, check previous months
//         if (!leaveWasDeducted && deductionFoundIn !== 'manual_leave') {
//           console.log(`  ℹ️ Checking previous months for leave deduction...`);

//           const previousMonthsBalances = await getPreviousMonthsELBalances(
//             attendance.employee,
//             leaveTypeDoc._id,
//             month,
//             year,
//             12,
//             dbSession
//           );

//           for (const prevBalance of previousMonthsBalances) {
//             if (prevBalance.used > 0 || prevBalance.lop > 0) {
//               // Check if there are any leaves in that previous month
//               const leavesInPrevMonth = await Leave.find({
//                 employee: attendance.employee,
//                 status: { $in: ["APPROVED", "PENDING"] },
//                 $or: [
//                   {
//                     startDate: {
//                       $gte: moment(prevBalance.month, 'MM').startOf('month').toDate(),
//                       $lte: moment(prevBalance.month, 'MM').endOf('month').toDate()
//                     }
//                   },
//                   {
//                     endDate: {
//                       $gte: moment(prevBalance.month, 'MM').startOf('month').toDate(),
//                       $lte: moment(prevBalance.month, 'MM').endOf('month').toDate()
//                     }
//                   }
//                 ]
//               }).session(dbSession);

//               // If no manual leaves in that month, deduction was automatic
//               if (leavesInPrevMonth.length === 0) {
//                 leaveWasDeducted = true;
//                 deductionFoundIn = `previous_month_${prevBalance.month}_${prevBalance.year}`;
//                 console.log(`  ✅ Leave was automatically deducted from ${prevBalance.month}/${prevBalance.year}`);
//                 break;
//               }
//             }
//           }
//         }

//         // STEP 3: If leave was deducted, add it back
//         if (leaveWasDeducted) {
//           console.log(`  ℹ️ Leave was automatically deducted. Adding back to balance...`);

//           // Add back the leave balance (try to add back 1 day)
//           const addBackResult = await addLeaveBalanceBack(
//             attendance.employee,
//             attendance.date,
//             dbSession
//           );

//           if (addBackResult.success && addBackResult.totalAddedBack > 0) {
//             leaveAddedBack = true;
//             isLeaveAdjusted = true;
//             leaveAdditionDetails = addBackResult;
//             console.log(`  ✅ Leave balance added back successfully: ${addBackResult.totalAddedBack} day(s)`);
//           } else {
//             console.log(`  ℹ️ No leave balance to add back. The deduction may have been from LOP or already consumed.`);

//             // Check if there's any LOP in current month that could be reduced
//             if (currentMonthBalance && currentMonthBalance.lop > 0) {
//               currentMonthBalance.lop = Math.max(0, currentMonthBalance.lop - 1);

//               // Remove this day from deductedDays since the deduction is being reversed
//               if (currentMonthBalance.deductedDays && currentMonthBalance.deductedDays.includes(attendanceDayOfMonth)) {
//                 currentMonthBalance.deductedDays = currentMonthBalance.deductedDays.filter(
//                   (d) => d !== attendanceDayOfMonth
//                 );
//               }

//               await currentMonthBalance.save({ session: dbSession });
//               leaveAddedBack = true;
//               isLeaveAdjusted = true;
//               leaveAdditionDetails = {
//                 success: true,
//                 message: "Reduced LOP by 1 day",
//                 totalAddedBack: 1,
//                 fromLOP: true
//               };
//               console.log(`  ✅ Reduced LOP by 1 day`);
//             } else {
//               // Check previous months for LOP
//               const previousMonthsBalances = await getPreviousMonthsELBalances(
//                 attendance.employee,
//                 leaveTypeDoc._id,
//                 month,
//                 year,
//                 12,
//                 dbSession
//               );

//               for (const prevBalance of previousMonthsBalances) {
//                 if (prevBalance.balance.lop > 0) {
//                   prevBalance.balance.lop = Math.max(0, prevBalance.balance.lop - 1);

//                   // Remove this day from deductedDays since the deduction is being reversed
//                   if (prevBalance.balance.deductedDays && prevBalance.balance.deductedDays.includes(attendanceDayOfMonth)) {
//                     prevBalance.balance.deductedDays = prevBalance.balance.deductedDays.filter(
//                       (d) => d !== attendanceDayOfMonth
//                     );
//                   }

//                   await prevBalance.balance.save({ session: dbSession });
//                   leaveAddedBack = true;
//                   isLeaveAdjusted = true;
//                   leaveAdditionDetails = {
//                     success: true,
//                     message: `Reduced LOP by 1 day from ${prevBalance.month}/${prevBalance.year}`,
//                     totalAddedBack: 1,
//                     fromLOP: true,
//                     fromMonth: prevBalance.month,
//                     fromYear: prevBalance.year
//                   };
//                   console.log(`  ✅ Reduced LOP by 1 day from ${prevBalance.month}/${prevBalance.year}`);
//                   break;
//                 }
//               }
//             }
//           }
//         } else {
//           console.log(`  ℹ️ No automatic leave deduction found for this date.`);
//         }
//       } else {
//         console.log(`  ⚠️ Leave type "EL" not found.`);
//       }
//     } else {
//       console.log(`  ℹ️ Attendance is not ABSENT or already regularized. Status: "${attendanceStatus}", Regularized: ${attendance.regularized || false}`);
//     }

//     // ================================================================
//     // UPDATE ATTENDANCE RECORD
//     // ================================================================

//     // Determine the punch times to use
//     const finalPunchIn = approvedPunchIn || regularization.requestedPunchIn || attendance.date;
//     const finalPunchOut = approvedPunchOut || regularization.requestedPunchOut ||
//       new Date(new Date(finalPunchIn).getTime() + 8 * 60 * 60 * 1000);

//     // Get the request type from regularization
//     const requestType = regularization.requestType;
//     console.log(`  ℹ️ Request Type: ${requestType}`);

//     // Update or create session
//     if (attendance.sessions.length === 0) {
//       // Create new session
//       attendance.sessions.push({
//         punchIn: finalPunchIn,
//         punchOut: finalPunchOut,
//         durationMinutes: Math.round((finalPunchOut - finalPunchIn) / (1000 * 60)),
//         manualPunchedOut: true,
//         punchOutLocation: {
//           address: "Regularized attendance"
//         },
//         punchInLocation: {
//           address: "Regularized attendance"
//         }
//       });
//       console.log(`  ✅ Created new session with punch in: ${finalPunchIn}, punch out: ${finalPunchOut}`);
//     } else {
//       // Update first session with regularization times
//       const firstSession = attendance.sessions[0];

//       // Update punch in if requested
//       if (requestType === "MISSING_PUNCH_IN" || requestType === "MISSING_BOTH" || requestType === "ABSENT_MARKED") {
//         firstSession.punchIn = finalPunchIn;
//         firstSession.punchInLocation = firstSession.punchInLocation || {
//           address: "Regularized attendance"
//         };
//         console.log(`  ✅ Updated punch in to: ${finalPunchIn}`);
//       }

//       // Update punch out if requested
//       if (requestType === "MISSING_PUNCH_OUT" || requestType === "MISSING_BOTH" || requestType === "ABSENT_MARKED") {
//         firstSession.punchOut = finalPunchOut;
//         firstSession.durationMinutes = Math.round((finalPunchOut - firstSession.punchIn) / (1000 * 60));
//         firstSession.manualPunchedOut = true;
//         firstSession.punchOutLocation = {
//           address: "Regularized attendance"
//         };
//         console.log(`  ✅ Updated punch out to: ${finalPunchOut}`);
//       }

//       // If it's WRONG_PUNCH_TIME, update both
//       if (requestType === "WRONG_PUNCH_TIME") {
//         firstSession.punchIn = finalPunchIn;
//         firstSession.punchOut = finalPunchOut;
//         firstSession.durationMinutes = Math.round((finalPunchOut - finalPunchIn) / (1000 * 60));
//         firstSession.manualPunchedOut = true;
//         firstSession.punchInLocation = firstSession.punchInLocation || {
//           address: "Regularized attendance"
//         };
//         firstSession.punchOutLocation = {
//           address: "Regularized attendance"
//         };
//         console.log(`  ✅ Updated both punch in and punch out for WRONG_PUNCH_TIME`);
//       }
//     }

//     // Update attendance totals
//     attendance.firstPunchIn = attendance.sessions[0]?.punchIn || finalPunchIn;
//     attendance.lastPunchOut = attendance.sessions[attendance.sessions.length - 1]?.punchOut || finalPunchOut;
//     attendance.totalWorkingMinutes = attendance.sessions.reduce(
//       (sum, s) => sum + (s.durationMinutes || 0), 0
//     );

//     // Mark as regularized
//     attendance.regularized = true;
//     attendance.regularizationRequestId = regularizationId;
//     attendance.regularizedAt = new Date();
//     attendance.regularizedBy = approvedBy;

//     // Update status to PRESENT
//     attendance.attendanceStatus = "PRESENT";
//     attendance.coreAttendanceStatus = "PRESENT";
//     attendance.status = "PRESENT";
//     attendance.isHalfDay = false;
//     attendance.halfDayType = null;
//     attendance.isLate = false;
//     attendance.lateMinutes = 0;
//     attendance.isEarlyLeave = false;
//     attendance.earlyLeaveMinutes = 0;

//     // Add remarks
//     const remarks = `Regularized by ${approvedBy} on ${new Date().toISOString()}. ${approvalRemark || ''}`;
//     attendance.remarks = attendance.remarks
//       ? `${attendance.remarks} | ${remarks}`
//       : remarks;

//     await attendance.save({ session: dbSession });
//     console.log(`  ✅ Attendance record updated and marked as PRESENT`);

//     // ================================================================
//     // UPDATE REGULARIZATION REQUEST
//     // ================================================================
//     regularization.status = "APPROVED";
//     regularization.approvedBy = approvedBy;
//     regularization.approvedAt = new Date();
//     regularization.approvalRemark = approvalRemark || "Regularization approved";
//     regularization.approvedPunchIn = finalPunchIn;
//     regularization.approvedPunchOut = finalPunchOut;
//     regularization.isLeaveAdjusted = isLeaveAdjusted;

//     await regularization.save({ session: dbSession });
//     console.log(`  ✅ Regularization request approved`);

//     await dbSession.commitTransaction();
//     dbSession.endSession();

//     return {
//       success: true,
//       message: "Regularization request approved successfully",
//       data: {
//         regularization,
//         attendance,
//         leaveAddedBack,
//         leaveAdditionDetails
//       }
//     };

//   } catch (error) {
//     await dbSession.abortTransaction();
//     dbSession.endSession();
//     console.error("Error in approveRegularization:", error);
//     throw error;
//   }
// };
// REJECT REGULARIZATION
const rejectRegularization = async (data) => {
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const { regularizationId, rejectedBy, rejectionRemark } = data;

    const regularization = await AttendanceRegularization.findById(regularizationId)
      .session(dbSession);

    if (!regularization) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: "Regularization request not found"
      };
    }

    if (regularization.status !== "PENDING") {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: `Cannot reject a ${regularization.status.toLowerCase()} request`
      };
    }

    regularization.status = "REJECTED";
    regularization.rejectedAt = new Date();
    regularization.approvalRemark = rejectionRemark;

    // We don't have rejectedBy in the model, so we'll use approvedBy field
    // Or you can add a rejectedBy field to your model
    regularization.approvedBy = rejectedBy;

    await regularization.save({ session: dbSession });

    await dbSession.commitTransaction();
    dbSession.endSession();

    return {
      success: true,
      message: "Regularization request rejected successfully",
      data: regularization
    };

  } catch (error) {
    await dbSession.abortTransaction();
    dbSession.endSession();
    console.error("Error in rejectRegularization:", error);
    throw error;
  }
};

// CANCEL REGULARIZATION
const cancelRegularization = async (data) => {
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const { regularizationId, cancelledBy } = data;

    const regularization = await AttendanceRegularization.findById(regularizationId)
      .session(dbSession);

    if (!regularization) {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: "Regularization request not found"
      };
    }

    if (regularization.status !== "PENDING") {
      await dbSession.abortTransaction();
      dbSession.endSession();
      return {
        success: false,
        message: `Cannot cancel a ${regularization.status.toLowerCase()} request`
      };
    }

    // Only the employee who requested or admin/HR can cancel
    if (regularization.employeeId.toString() !== cancelledBy.toString()) {
      // Check if user is admin/HR
      // You can add role check here
    }

    regularization.status = "CANCELLED";
    regularization.cancelledAt = new Date();

    await regularization.save({ session: dbSession });

    await dbSession.commitTransaction();
    dbSession.endSession();

    return {
      success: true,
      message: "Regularization request cancelled successfully",
      data: regularization
    };

  } catch (error) {
    await dbSession.abortTransaction();
    dbSession.endSession();
    console.error("Error in cancelRegularization:", error);
    throw error;
  }
};

// GET EMPLOYEE REGULARIZATION SUMMARY
const getEmployeeRegularizationSummary = async (data) => {
  try {
    const { employeeId, year, month } = data;

    // Get all regularization requests for the employee in the specified month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const requests = await AttendanceRegularization.find({
      employeeId,
      attendanceDate: { $gte: startDate, $lte: endDate }
    }).populate('attendanceId');

    const totalRequests = requests.length;
    const pendingRequests = requests.filter(r => r.status === "PENDING").length;
    const approvedRequests = requests.filter(r => r.status === "APPROVED").length;
    const rejectedRequests = requests.filter(r => r.status === "REJECTED").length;
    const cancelledRequests = requests.filter(r => r.status === "CANCELLED").length;

    // Get leave adjustment summary
    const leaveAdjustedRequests = requests.filter(r => r.isLeaveAdjusted === true).length;

    // Get attendance summary for the month
    const attendanceRecords = await Attendance.find({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate }
    });

    const totalAttendance = attendanceRecords.length;
    const regularizedCount = attendanceRecords.filter(a => a.regularized === true).length;

    return {
      success: true,
      data: {
        summary: {
          totalRequests,
          pending: pendingRequests,
          approved: approvedRequests,
          rejected: rejectedRequests,
          cancelled: cancelledRequests,
          leaveAdjusted: leaveAdjustedRequests
        },
        attendance: {
          totalDays: totalAttendance,
          regularized: regularizedCount,
          regularizedPercentage: totalAttendance > 0
            ? Math.round((regularizedCount / totalAttendance) * 100)
            : 0
        },
        requests: requests.map(r => ({
          id: r._id,
          requestType: r.requestType,
          status: r.status,
          attendanceDate: r.attendanceDate,
          requestedAt: r.createdAt,
          isLeaveAdjusted: r.isLeaveAdjusted
        }))
      }
    };

  } catch (error) {
    console.error("Error in getEmployeeRegularizationSummary:", error);
    throw error;
  }
};





module.exports = {
  punchIn,
  punchOut,
  getAttendanceForEmployee,
  getAttendanceSummary,
  breakIn,
  breakOut,
  visitIn,
  visitOut,
  getDepartmentDistribution,
  getAttendanceTrend,
  getAttendanceForAdmin,
  generateAttendanceReport,
  requestRegularization,
  getRegularizationRequests,
  getRegularizationById,
  approveRegularization,
  rejectRegularization,
  cancelRegularization,
  getEmployeeRegularizationSummary,
};