const moment = require("moment");
const mongoose = require("mongoose");
const Attendance = require("../models/attendance.model");
const Employee = require("../models/employee.model");
const ShiftPolicy = require("../models/shiftPolicy.model");
const Leave = require("../models/leave.model");
const LeaveBalance = require("../models/leaveBalance.model");
const LeaveType = require("../models/leaveType.model");
const Holiday = require("../models/holiday.model");
const { evaluateAttendance } = require("./attendanceEvaluator");

const toLocalTime = (utcDate) => moment(utcDate).utcOffset("+05:30");

const getShiftEndUTC = (date) => {
  const day = moment(date).utcOffset("+05:30").startOf("day");
  const shiftEndLocal = moment(day).hour(18).minute(30).second(0).millisecond(0);
  return shiftEndLocal.utc().toDate();
};

const applyEvaluationResult = (attendanceDoc, evaluated) => {
  // Core status fields (persist across saves)
  attendanceDoc.coreAttendanceStatus = evaluated.coreAttendanceStatus;
  attendanceDoc.coreHalfDayType = evaluated.coreHalfDayType;
  attendanceDoc.coreMorningShortLeave = evaluated.coreMorningShortLeave;
  attendanceDoc.coreIsLate = evaluated.coreIsLate;
  attendanceDoc.coreLateMinutes = evaluated.coreLateMinutes;

  // Regular status fields
  attendanceDoc.attendanceStatus = evaluated.attendanceStatus;
  attendanceDoc.status = evaluated.status;
  attendanceDoc.isHalfDay = evaluated.isHalfDay;
  attendanceDoc.halfDayType = evaluated.halfDayType;
  attendanceDoc.isLate = evaluated.isLate;
  attendanceDoc.lateMinutes = evaluated.lateMinutes;
  attendanceDoc.isEarlyLeave = evaluated.isEarlyLeave;
  attendanceDoc.earlyLeaveMinutes = evaluated.earlyLeaveMinutes;
  attendanceDoc.morningShortLeave = evaluated.morningShortLeave;
  attendanceDoc.eveningShortLeave = evaluated.eveningShortLeave;
  attendanceDoc.totalWorkingMinutes = evaluated.totalWorkingMinutes;
  attendanceDoc.totalBreakMinutes = evaluated.totalBreakMinutes;
  attendanceDoc.breakCount = evaluated.breakCount;
  attendanceDoc.firstPunchIn = evaluated.firstPunchIn;
  attendanceDoc.lastPunchOut = evaluated.lastPunchOut;
};

// ============================================================================
// WEEK OFF LOGIC - Sunday + 2nd & 4th Saturday
// ============================================================================
const isWeekOff = (date) => {
  // Convert to local date for consistent calculation
  const localDate = new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );

  const day = localDate.getDay();

  // Sunday (0 = Sunday)
  if (day === 0) {
    return true;
  }

  // 2nd & 4th Saturday (6 = Saturday)
  if (day === 6) {
    const dateOfMonth = localDate.getDate();
    const saturdayNumber = Math.floor((dateOfMonth - 1) / 7) + 1;

    if (saturdayNumber === 2 || saturdayNumber === 4) {
      return true;
    }
  }

  return false;
};

// // ============================================================================
// // WEEK OFF LOGIC - Sunday + 2nd & 4th Saturday + Holiday
// // ============================================================================

// const isWeekOff = async (date) => {
//   // Convert UTC date to IST
//   const localDate = moment(date).utcOffset("+05:30");

//   const day = localDate.day(); // 0 = Sunday, 6 = Saturday

//   // ==========================================================================
//   // SUNDAY
//   // ==========================================================================

//   if (day === 0) {
//     return true;
//   }

//   // ==========================================================================
//   // 2ND & 4TH SATURDAY
//   // ==========================================================================

//   if (day === 6) {
//     const dateOfMonth = localDate.date();

//     // 1st Saturday: 1-7
//     // 2nd Saturday: 8-14
//     // 3rd Saturday: 15-21
//     // 4th Saturday: 22-28
//     // 5th Saturday: 29-31

//     const saturdayNumber = Math.floor((dateOfMonth - 1) / 7) + 1;

//     if (saturdayNumber === 2 || saturdayNumber === 4) {
//       return true;
//     }
//   }

//   // ==========================================================================
//   // CHECK HOLIDAY
//   // ==========================================================================

//   const startOfDay = localDate.clone().startOf("day").utc().toDate();

//   const endOfDay = localDate.clone().endOf("day").utc().toDate();

//   const holiday = await Holiday.findOne({
//     date: {
//       $gte: startOfDay,
//       $lte: endOfDay,
//     },
//     isActive: true,
//   });

//   return !!holiday;
// };



// ============================================================================
// FORCE SET ATTENDANCE TO ABSENT (For forgotten punch outs)
// ============================================================================
const forceSetAbsent = (attendanceDoc) => {
  attendanceDoc.attendanceStatus = "ABSENT";
  attendanceDoc.coreAttendanceStatus = "ABSENT";
  attendanceDoc.status = "ABSENT";
  attendanceDoc.isHalfDay = false;
  attendanceDoc.halfDayType = undefined;
  attendanceDoc.isLate = false;
  attendanceDoc.lateMinutes = 0;
  attendanceDoc.isEarlyLeave = false;
  attendanceDoc.earlyLeaveMinutes = 0;
  attendanceDoc.morningShortLeave = { isShortLeave: false, minutes: 0 };
  attendanceDoc.eveningShortLeave = { isShortLeave: false, minutes: 0 };
  attendanceDoc.totalWorkingMinutes = 0;
};

// ============================================================================
// CHECK IF DATE FALLS WITHIN LEAVE RANGE (Handles null toDate)
// ============================================================================
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
// GET PREVIOUS MONTHS' EL BALANCES
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

    if (prevYear < currentYear) {
      continue;
    }

    const balance = await LeaveBalance.findOne({
      employeeId: employeeId,
      leaveTypeId: leaveTypeId,
      month: prevMonth,
      year: prevYear
    }).session(session);

    if (balance && balance.remaining > 0) {
      previousBalances.push({
        balance: balance,
        month: prevMonth,
        year: prevYear,
        remaining: balance.remaining
      });
    }
  }

  previousBalances.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  return previousBalances;
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
// DEDUCT SHORT LEAVE BALANCE (0.5 day from Short Leave first, then EL)
// ============================================================================
const deductShortLeaveBalance = async (employeeId, date, leaveTypeCode = "SL", session = null) => {
  try {
    console.log(`  ℹ️ Processing SHORT LEAVE deduction for ${moment(date).format('YYYY-MM-DD')}`);

    // First, check if employee has Short Leave type
    const shortLeaveType = await LeaveType.findOne({ code: leaveTypeCode }).session(session);
    if (!shortLeaveType) {
      console.log(`  ⚠️ Leave type "${leaveTypeCode}" not found. Falling back to EL deduction.`);
      return await deductHalfDayLeaveBalance(employeeId, date, "SHORT_LEAVE", "EL", session);
    }

    const month = moment(date).month() + 1;
    const year = moment(date).year();
    const dayOfMonth = moment(date).date();

    // Check Short Leave balance first
    let shortLeaveBalance = await LeaveBalance.findOne({
      employeeId: employeeId,
      leaveTypeId: shortLeaveType._id,
      month,
      year,
    }).session(session);

    console.log(`  ℹ️ Short Leave balance found: ${shortLeaveBalance ? shortLeaveBalance.remaining : 0} days`);

    // ============================================================
    // STEP 1: Check if Short Leave has sufficient balance (> 0.5)
    // ============================================================
    if (shortLeaveBalance && shortLeaveBalance.remaining >= 0.5) {
      console.log(`  ℹ️ Sufficient Short Leave balance (${shortLeaveBalance.remaining} >= 0.5). Deducting from Short Leave.`);

      // Check if already deducted
      if (shortLeaveBalance.deductedDays && shortLeaveBalance.deductedDays.includes(dayOfMonth)) {
        console.log(`  ℹ️ Day ${dayOfMonth} already deducted from Short Leave. Skipping.`);
        return {
          success: true,
          alreadyDeducted: true,
          balance: shortLeaveBalance,
          used: shortLeaveBalance.used,
          remaining: shortLeaveBalance.remaining,
          lop: shortLeaveBalance.lop || 0,
          deductedFrom: "SHORT_LEAVE",
          message: `Day ${dayOfMonth} already deducted from Short Leave`
        };
      }

      // Deduct from Short Leave
      shortLeaveBalance.used += 0.5;
      shortLeaveBalance.remaining -= 0.5;
      shortLeaveBalance.deductedDays = shortLeaveBalance.deductedDays || [];
      if (!shortLeaveBalance.deductedDays.includes(dayOfMonth)) {
        shortLeaveBalance.deductedDays.push(dayOfMonth);
      }
      await shortLeaveBalance.save({ session });

      console.log(`  ✅ Deducted 0.5 day from Short Leave (remaining: ${shortLeaveBalance.remaining})`);

      return {
        success: true,
        balance: shortLeaveBalance,
        used: shortLeaveBalance.used,
        remaining: shortLeaveBalance.remaining,
        lop: shortLeaveBalance.lop || 0,
        deductedFrom: "SHORT_LEAVE",
        message: "Short leave deducted from Short Leave balance"
      };
    }

    // ============================================================
    // STEP 2: If Short Leave doesn't have sufficient balance, try EL
    // ============================================================
    console.log(`  ℹ️ Insufficient Short Leave balance (${shortLeaveBalance ? shortLeaveBalance.remaining : 0} < 0.5). Checking EL balance...`);

    // First check if EL balance has sufficient balance
    const elLeaveType = await LeaveType.findOne({ code: "EL" }).session(session);
    if (elLeaveType) {
      const elBalance = await LeaveBalance.findOne({
        employeeId: employeeId,
        leaveTypeId: elLeaveType._id,
        month,
        year,
      }).session(session);

      console.log(`  ℹ️ EL Balance: ${elBalance ? elBalance.remaining : 0} days`);

      // If EL has sufficient balance, deduct from EL
      if (elBalance && elBalance.remaining >= 0.5) {
        console.log(`  ℹ️ Sufficient EL balance. Deducting 0.5 day from EL.`);

        // Check if already deducted
        if (elBalance.deductedDays && elBalance.deductedDays.includes(dayOfMonth)) {
          console.log(`  ℹ️ Day ${dayOfMonth} already deducted from EL. Skipping.`);
          return {
            success: true,
            alreadyDeducted: true,
            balance: elBalance,
            used: elBalance.used,
            remaining: elBalance.remaining,
            lop: elBalance.lop || 0,
            deductedFrom: "EL_BALANCE",
            message: `Day ${dayOfMonth} already deducted from EL`
          };
        }

        // Deduct from EL
        elBalance.used += 0.5;
        elBalance.remaining -= 0.5;
        elBalance.deductedDays = elBalance.deductedDays || [];
        if (!elBalance.deductedDays.includes(dayOfMonth)) {
          elBalance.deductedDays.push(dayOfMonth);
        }
        await elBalance.save({ session });

        console.log(`  ✅ Deducted 0.5 day from EL (remaining: ${elBalance.remaining})`);

        return {
          success: true,
          balance: elBalance,
          used: elBalance.used,
          remaining: elBalance.remaining,
          lop: elBalance.lop || 0,
          deductedFrom: "EL_BALANCE",
          message: "Short leave deducted from EL balance"
        };
      }
    }

    // ============================================================
    // STEP 3: If both Short Leave and EL have insufficient balance, mark as LOP
    // ============================================================
    console.log(`  ⚠️ No sufficient balance in Short Leave or EL. Marking as LOP.`);

    // Find or create EL balance to add LOP
    if (elLeaveType) {
      let elBalance = await LeaveBalance.findOne({
        employeeId: employeeId,
        leaveTypeId: elLeaveType._id,
        month,
        year,
      }).session(session);

      if (!elBalance) {
        elBalance = new LeaveBalance({
          employeeId: employeeId,
          leaveTypeId: elLeaveType._id,
          month,
          year,
          total: 0,
          used: 0,
          remaining: 0,
          lop: 0,
          deductedDays: [],
        });
      }

      // Check if already deducted as LOP
      if (elBalance.deductedDays && elBalance.deductedDays.includes(dayOfMonth)) {
        console.log(`  ℹ️ Day ${dayOfMonth} already deducted. Skipping LOP.`);
        return {
          success: true,
          alreadyDeducted: true,
          balance: elBalance,
          used: elBalance.used,
          remaining: elBalance.remaining,
          lop: elBalance.lop || 0,
          deductedFrom: "LOP",
          message: `Day ${dayOfMonth} already deducted as LOP`
        };
      }

      // Add to LOP
      elBalance.lop = (elBalance.lop || 0) + 0.5;
      elBalance.deductedDays = elBalance.deductedDays || [];
      if (!elBalance.deductedDays.includes(dayOfMonth)) {
        elBalance.deductedDays.push(dayOfMonth);
      }
      await elBalance.save({ session });

      console.log(`  ✅ Marked 0.5 day as LOP (total LOP: ${elBalance.lop})`);

      return {
        success: true,
        balance: elBalance,
        used: elBalance.used,
        remaining: elBalance.remaining,
        lop: elBalance.lop || 0,
        deductedFrom: "LOP",
        message: "No Short Leave or EL balance available. Marked as LOP."
      };
    }

    // If EL type not found, create generic LOP
    console.log(`  ⚠️ EL type not found. Creating LOP record.`);
    return {
      success: true,
      deductedFrom: "LOP",
      message: "No leave balance available. Marked as LOP.",
      lop: 0.5
    };

  } catch (error) {
    console.error(`  ❌ Error deducting short leave balance:`, error.message);
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

    console.log(`  ℹ️ Current balance before deduction - used: ${balance.used}, remaining: ${balance.remaining}, lop: ${balance.lop || 0}`);

    // ============================================================
    // CHECK: Is this day already deducted (full day or half day)?
    // ============================================================
    if (balance.deductedDays && balance.deductedDays.includes(dayOfMonth)) {
      console.log(`  ℹ️ Day ${dayOfMonth} already has a deduction. Skipping to avoid double deduction.`);
      return {
        success: true,
        alreadyDeducted: true,
        balance,
        used: balance.used,
        remaining: balance.remaining,
        lop: balance.lop || 0,
        halfDayType,
        message: `Day ${dayOfMonth} already has a deduction - skipping`
      };
    }

    const amountToDeduct = 0.5;
    let remainingToDeduct = amountToDeduct;
    let totalDeducted = 0;

    // STEP 1: Try current month's balance first
    if (balance.remaining >= remainingToDeduct) {
      console.log(`  ℹ️ Current month balance sufficient. Deducting ${remainingToDeduct} day from current month.`);
      balance.used += remainingToDeduct;
      balance.remaining -= remainingToDeduct;
      totalDeducted += remainingToDeduct;
      remainingToDeduct = 0;
      console.log(`  ✅ Used ${remainingToDeduct} day (half day) from current month (remaining: ${balance.remaining})`);
    } else if (balance.remaining > 0) {
      console.log(`  ℹ️ Current month balance insufficient. Using available ${balance.remaining} day from current month.`);
      const available = balance.remaining;
      balance.used += available;
      balance.remaining = 0;
      totalDeducted += available;
      remainingToDeduct -= available;
      console.log(`  ✅ Used ${available} day from current month (remaining: 0)`);
    } else {
      console.log(`  ℹ️ Current month balance is 0. Checking previous months...`);
    }

    // STEP 2: If still need to deduct, check previous months' EL balances
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

      let foundInPrevious = false;
      for (const prevBalance of previousBalances) {
        if (remainingToDeduct <= 0) break;

        const availableFromPrev = Math.min(prevBalance.remaining, remainingToDeduct);

        if (availableFromPrev > 0) {
          prevBalance.balance.used += availableFromPrev;
          prevBalance.balance.remaining -= availableFromPrev;
          totalDeducted += availableFromPrev;
          remainingToDeduct -= availableFromPrev;
          foundInPrevious = true;

          console.log(`  ✅ Used ${availableFromPrev} day (half day) from ${prevBalance.month}/${prevBalance.year} (remaining: ${prevBalance.balance.remaining})`);
          await prevBalance.balance.save({ session });
        }
      }

      if (!foundInPrevious) {
        console.log(`  ℹ️ No balance found in previous months either.`);
      }
    }

    // STEP 3: If still remaining, convert to LOP
    if (remainingToDeduct > 0) {
      console.log(`  ⚠️ No sufficient EL balance in current or previous months. Converting ${remainingToDeduct} day(s) to LOP.`);
      const currentLop = balance.lop || 0;
      balance.lop = currentLop + remainingToDeduct;
      totalDeducted += remainingToDeduct;
      console.log(`  ⚠️ LOP increased from ${currentLop} to ${balance.lop} (added ${remainingToDeduct})`);
    }

    // Mark this day as deducted (on the current month's balance record)
    balance.deductedDays = balance.deductedDays || [];
    if (!balance.deductedDays.includes(dayOfMonth)) {
      balance.deductedDays.push(dayOfMonth);
    }

    await balance.save({ session });

    console.log(`  ✅ Half day leave balance updated: used=${balance.used}, remaining=${balance.remaining}, lop=${balance.lop || 0}, deductedDays=${balance.deductedDays}`);

    return {
      success: true,
      balance,
      used: balance.used,
      remaining: balance.remaining,
      lop: balance.lop || 0,
      halfDayType,
      deductedAmount: totalDeducted,
      remainingToDeduct: remainingToDeduct
    };

  } catch (error) {
    console.error(`  ❌ Error deducting half day leave balance:`, error.message);
    return { success: false, message: error.message };
  }
};

// ============================================================================
// CHECK AND DEDUCT LEAVE FOR AN EMPLOYEE ON A SPECIFIC DATE
// ============================================================================
const processLeaveForDate = async (employeeId, date, session = null) => {
  try {
    const allLeaves = await Leave.find({
      employee: employeeId,
    }).session(session);

    let matchingLeave = null;

    for (const leave of allLeaves) {
      if (isDateInLeaveRange(date, leave)) {
        matchingLeave = leave;
        break;
      }
    }

    if (!matchingLeave) {
      console.log(`  ℹ️ No leave found for this date - deducting from balance...`);
      const result = await deductLeaveBalanceForDate(employeeId, date, "EL", session);
      return {
        success: result.success,
        status: "NO_LEAVE_DEDUCTED",
        message: "No leave - deducted from balance",
        result
      };
    }

    if (matchingLeave.status === "APPROVED") {
      console.log(`  ℹ️ Employee has APPROVED leave for this date. Skipping deduction.`);
      return {
        success: true,
        status: "APPROVED",
        message: "Approved leave - no deduction needed",
        leave: matchingLeave
      };
    }

    if (matchingLeave.status === "PENDING" && matchingLeave.leaveBalanceDeducted === true) {
      console.log(`  ℹ️ PENDING leave already deducted by cron. Skipping deduction.`);
      return {
        success: true,
        status: "PENDING_ALREADY_DEDUCTED",
        message: "Pending leave already deducted",
        leave: matchingLeave
      };
    }

    if (matchingLeave.status === "PENDING" && matchingLeave.leaveBalanceDeducted !== true) {
      console.log(`  ℹ️ PENDING leave found - deducting now...`);

      const result = await deductLeaveBalanceForDate(employeeId, date, "EL", session);

      if (result.success) {
        matchingLeave.leaveBalanceDeducted = true;
        await matchingLeave.save({ session });
        console.log(`  ✅ PENDING leave marked as deducted.`);
      }

      return {
        success: result.success,
        status: "PENDING_DEDUCTED",
        message: "Pending leave deducted",
        leave: matchingLeave,
        result
      };
    }

    return { success: true, message: "No action needed" };

  } catch (error) {
    console.error(`  ❌ Error processing leave:`, error.message);
    return { success: false, message: error.message };
  }
};

// ============================================================================
// CHECK FOR HALF DAY AND DEDUCT LEAVE IF NEEDED
// ============================================================================
const processHalfDayLeaveDeduction = async (employeeId, date, halfDayType, session = null) => {
  try {
    console.log(`  ℹ️ Processing HALF DAY leave deduction for ${moment(date).format('YYYY-MM-DD')}`);

    const allLeaves = await Leave.find({
      employee: employeeId,
    }).session(session);

    let matchingLeave = null;

    for (const leave of allLeaves) {
      if (isDateInLeaveRange(date, leave)) {
        matchingLeave = leave;
        break;
      }
    }

    if (matchingLeave) {
      if (matchingLeave.status === "APPROVED") {
        console.log(`  ℹ️ Employee has APPROVED leave for this date. Skipping half-day deduction.`);
        return {
          success: true,
          status: "APPROVED",
          message: "Approved leave - no deduction needed",
          leave: matchingLeave
        };
      }

      if (matchingLeave.status === "PENDING" && matchingLeave.leaveBalanceDeducted === true) {
        console.log(`  ℹ️ PENDING leave already deducted. Skipping half-day deduction.`);
        return {
          success: true,
          status: "PENDING_ALREADY_DEDUCTED",
          message: "Pending leave already deducted",
          leave: matchingLeave
        };
      }

      if (matchingLeave.status === "PENDING" && matchingLeave.leaveBalanceDeducted !== true) {
        console.log(`  ℹ️ PENDING leave found - deducting full day instead of half day...`);
        const result = await deductLeaveBalanceForDate(employeeId, date, "EL", session);
        if (result.success) {
          matchingLeave.leaveBalanceDeducted = true;
          await matchingLeave.save({ session });
        }
        return {
          success: result.success,
          status: "PENDING_DEDUCTED",
          message: "Pending leave deducted (full day)",
          leave: matchingLeave,
          result
        };
      }
    }

    console.log(`  ℹ️ No leave found. Deducting HALF DAY (${halfDayType}) from balance...`);
    const result = await deductHalfDayLeaveBalance(employeeId, date, halfDayType, "EL", session);

    return {
      success: result.success,
      status: "HALF_DAY_DEDUCTED",
      message: `Half day (${halfDayType}) deducted from balance`,
      result
    };

  } catch (error) {
    console.error(`  ❌ Error processing half day deduction:`, error.message);
    return { success: false, message: error.message };
  }
};

// ============================================================================
// PROCESS SHORT LEAVE DEDUCTION (UPDATED)
// ============================================================================
const processShortLeaveForDate = async (employeeId, date, session = null) => {
  try {
    console.log(`  ℹ️ Processing SHORT LEAVE deduction for ${moment(date).format('YYYY-MM-DD')}`);

    const allLeaves = await Leave.find({
      employee: employeeId,
    }).session(session);

    let matchingLeave = null;

    for (const leave of allLeaves) {
      if (isDateInLeaveRange(date, leave)) {
        matchingLeave = leave;
        break;
      }
    }

    // If employee has any leave for this date
    if (matchingLeave) {
      if (matchingLeave.status === "APPROVED") {
        console.log(`  ℹ️ Employee has APPROVED leave for this date. Skipping short leave deduction.`);
        return {
          success: true,
          status: "APPROVED",
          message: "Approved leave - no deduction needed",
          leave: matchingLeave
        };
      }

      if (matchingLeave.status === "PENDING" && matchingLeave.leaveBalanceDeducted === true) {
        console.log(`  ℹ️ PENDING leave already deducted. Skipping short leave deduction.`);
        return {
          success: true,
          status: "PENDING_ALREADY_DEDUCTED",
          message: "Pending leave already deducted",
          leave: matchingLeave
        };
      }

      if (matchingLeave.status === "PENDING" && matchingLeave.leaveBalanceDeducted !== true) {
        console.log(`  ℹ️ PENDING leave found - deducting full day instead of short leave...`);
        const result = await deductLeaveBalanceForDate(employeeId, date, "EL", session);
        if (result.success) {
          matchingLeave.leaveBalanceDeducted = true;
          await matchingLeave.save({ session });
        }
        return {
          success: result.success,
          status: "PENDING_DEDUCTED",
          message: "Pending leave deducted (full day)",
          leave: matchingLeave,
          result
        };
      }
    }

    // No leave found - process short leave deduction
    console.log(`  ℹ️ No leave found. Checking leave balances for SHORT LEAVE deduction...`);

    const result = await deductShortLeaveBalance(employeeId, date, "SL", session);

    if (result.success) {
      return {
        success: true,
        status: result.deductedFrom === "SHORT_LEAVE" ? "SHORT_LEAVE_DEDUCTED" :
          result.deductedFrom === "EL_BALANCE" ? "EL_DEDUCTED" : "LOP",
        message: result.message,
        result,
        deductedFrom: result.deductedFrom
      };
    } else {
      return {
        success: false,
        status: "DEDUCTION_FAILED",
        message: "Failed to deduct short leave"
      };
    }

  } catch (error) {
    console.error(`  ❌ Error processing short leave deduction:`, error.message);
    return { success: false, message: error.message };
  }
};

// ============================================================================
// CHECK IF EMPLOYEE WAS EMPLOYED ON A GIVEN DATE
// ============================================================================
const isEmployeeEmployedOnDate = (employee, date) => {
  if (!employee || !employee.joiningDate) {
    console.log(`  ℹ️ No joining date found. Assuming employee was employed.`);
    return true;
  }

  try {
    const joinDate = new Date(employee.joiningDate);
    const targetDate = new Date(date);

    if (isNaN(joinDate.getTime()) || isNaN(targetDate.getTime())) {
      console.log(`  ⚠️ Invalid date. Assuming employed.`);
      return true;
    }

    const joinYear = joinDate.getUTCFullYear();
    const joinMonth = String(joinDate.getUTCMonth() + 1).padStart(2, '0');
    const joinDay = String(joinDate.getUTCDate()).padStart(2, '0');
    const joinDateStr = `${joinYear}-${joinMonth}-${joinDay}`;

    const targetYear = targetDate.getUTCFullYear();
    const targetMonth = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const targetDay = String(targetDate.getUTCDate()).padStart(2, '0');
    const targetDateStr = `${targetYear}-${targetMonth}-${targetDay}`;

    const isEmployed = joinDateStr <= targetDateStr;

    console.log(`  ℹ️ Joining Date (UTC): ${joinDateStr}`);
    console.log(`  ℹ️ Target Date (UTC): ${targetDateStr}`);
    console.log(`  ℹ️ Is Employed? ${isEmployed ? 'YES ✅' : 'NO ❌'}`);

    return isEmployed;
  } catch (error) {
    console.log(`  ⚠️ Error checking joining date: ${error.message}. Assuming employed.`);
    return true;
  }
};

// ============================================================================
// CHECK IF EMPLOYEE SHOULD HAVE LEAVE DEDUCTED FOR A DATE
// ============================================================================
const shouldDeductLeaveForDate = (employee, date) => {
  if (!employee || !employee.joiningDate) {
    return true;
  }

  try {
    const joinDate = new Date(employee.joiningDate);
    const targetDate = new Date(date);

    if (isNaN(joinDate.getTime()) || isNaN(targetDate.getTime())) {
      return true;
    }

    const joinYear = joinDate.getUTCFullYear();
    const joinMonth = String(joinDate.getUTCMonth() + 1).padStart(2, '0');
    const joinDay = String(joinDate.getUTCDate()).padStart(2, '0');
    const joinDateStr = `${joinYear}-${joinMonth}-${joinDay}`;

    const targetYear = targetDate.getUTCFullYear();
    const targetMonth = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const targetDay = String(targetDate.getUTCDate()).padStart(2, '0');
    const targetDateStr = `${targetYear}-${targetMonth}-${targetDay}`;

    if (joinDateStr > targetDateStr) {
      console.log(`  ℹ️ Employee joined after target date. No leave deduction.`);
      return false;
    }

    if (joinDateStr === targetDateStr) {
      console.log(`  ℹ️ Target date is joining date. No leave deduction (joining day is free).`);
      return false;
    }

    return true;
  } catch (error) {
    console.log(`  ⚠️ Error in shouldDeductLeaveForDate: ${error.message}. Assuming leave deduction.`);
    return true;
  }
};

// ============================================================================
// AUTO PUNCH OUT - Runs at midnight every day
// ============================================================================
const autoPunchOutMissedEmployees = async () => {
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    console.log("=".repeat(60));
    console.log("AUTO PUNCH-OUT CRON JOB STARTED");
    console.log("=".repeat(60));
    console.log("UTC Time:", new Date().toISOString());
    console.log("IST Time:", toLocalTime(new Date()).format("YYYY-MM-DD HH:mm:ss"));

    const yesterday = moment().utc().subtract(1, "day").startOf("day").toDate();
    const yesterdayEnd = moment().utc().subtract(1, "day").endOf("day").toDate();

    console.log("Processing date (IST):", toLocalTime(yesterday).format("YYYY-MM-DD"));
    console.log("Processing date (UTC):", yesterday.toISOString().split('T')[0]);

    const yesterdayWeekOff = isWeekOff(yesterday);
    console.log(`Is yesterday a week off? ${yesterdayWeekOff ? 'YES' : 'NO'}`);

    const allEmployees = await Employee.find({ isActive: true });

    console.log("\n🔍 FILTERING EMPLOYEES BY JOINING DATE:");
    console.log("-".repeat(40));

    const employeesToProcess = [];
    const employeesToSkip = [];

    for (const emp of allEmployees) {
      const isEmployed = isEmployeeEmployedOnDate(emp, yesterday);
      const shouldDeduct = shouldDeductLeaveForDate(emp, yesterday);

      if (isEmployed && shouldDeduct) {
        employeesToProcess.push(emp);
        console.log(`  ✅ PROCESS: ${emp.fullName || emp.employeeCode} (Joined: ${emp.joiningDate ? new Date(emp.joiningDate).toISOString().split('T')[0] : 'Unknown'})`);
      } else {
        employeesToSkip.push(emp);
        console.log(`  ⏭️ SKIP: ${emp.fullName || emp.employeeCode} - ${!isEmployed ? 'Not employed yet' : 'Joining day'}`);
      }
    }

    const processEmployeeIds = employeesToProcess.map(emp => emp._id.toString());

    console.log("-".repeat(40));
    console.log(`Total active employees: ${allEmployees.length}`);
    console.log(`Employees to process: ${employeesToProcess.length}`);
    console.log(`Employees skipped: ${employeesToSkip.length}`);
    console.log("=".repeat(40) + "\n");

    const openAttendances = await Attendance.find({
      date: {
        $gte: yesterday,
        $lte: yesterdayEnd,
      },
      sessions: {
        $elemMatch: {
          punchOut: { $eq: null },
        },
      },
      employee: { $in: processEmployeeIds }
    }).populate("employee");

    console.log(`Found ${openAttendances.length} employee(s) with open sessions (forgot to punch out)`);

    const employeesWithAttendance = await Attendance.distinct("employee", {
      date: {
        $gte: yesterday,
        $lte: yesterdayEnd,
      },
      employee: { $in: processEmployeeIds }
    });

    const employeesWithoutAttendance = employeesToProcess.filter(
      emp => !employeesWithAttendance.some(id => id.toString() === emp._id.toString())
    );

    console.log(`Found ${employeesWithoutAttendance.length} employee(s) with no attendance (didn't punch in)`);

    const completedAttendances = await Attendance.find({
      date: {
        $gte: yesterday,
        $lte: yesterdayEnd,
      },
      employee: { $in: processEmployeeIds },
      'sessions.punchOut': { $ne: null },
      $or: [
        { 'sessions.punchIn': { $ne: null } },
      ]
    }).populate("employee");

    const completedAttendancesWithoutOpenSessions = completedAttendances.filter(att => {
      return !att.sessions.some(s => !s.punchOut);
    });

    console.log(`Found ${completedAttendancesWithoutOpenSessions.length} employee(s) with completed punch in/out`);

    let updatedCount = 0;
    let errorCount = 0;
    let fullDayDeductionCount = 0;
    let halfDayDeductionCount = 0;
    let shortLeaveDeductionCount = 0;
    let onApprovedLeaveCount = 0;
    let pendingLeaveDeductedCount = 0;
    let noLeaveDeductedCount = 0;
    let weeklyOffCount = 0;
    let presentCount = 0;
    let forgotPunchOutCount = 0;
    let noPunchInCount = 0;
    const autoPunchOutTime = getShiftEndUTC(yesterday);

    // ================================================================
    // PROCESS SCENARIO 1: Employees who forgot to punch out
    // ALWAYS deduct FULL DAY leave
    // ================================================================
    for (const attendance of openAttendances) {
      try {
        const empName = attendance.employee?.fullName || String(attendance.employee);
        console.log(`\n📌 [FORGOT TO PUNCH OUT] Processing: ${empName}`);

        if (!attendance.employee || !attendance.employee._id) {
          console.log(`  ❌ Employee not found or invalid. Skipping...`);
          errorCount++;
          continue;
        }

        const employee = await Employee.findById(attendance.employee._id);
        if (!employee || !employee.isActive) {
          console.log(`  ℹ️ Employee is inactive. Closing session but skipping leave deduction.`);

          const openSessions = attendance.sessions.filter((s) => !s.punchOut);
          for (const sess of openSessions) {
            sess.punchOut = autoPunchOutTime;
            sess.durationMinutes = 0;
            sess.autoPunchedOut = true;
            sess.punchOutLocation = {
              latitude: null,
              longitude: null,
              address: "Auto punched out - Employee inactive",
              imageUrl: null,
            };
          }
          attendance.totalWorkingMinutes = 0;
          attendance.lastPunchOut = autoPunchOutTime;
          forceSetAbsent(attendance);

          await attendance.save({ session: dbSession });
          updatedCount++;
          continue;
        }

        if (yesterdayWeekOff) {
          console.log(`  ℹ️ Yesterday was a WEEK OFF. Marking as WEEK_OFF.`);
          weeklyOffCount++;

          const openSessions = attendance.sessions.filter((s) => !s.punchOut);
          for (const sess of openSessions) {
            sess.punchOut = autoPunchOutTime;
            sess.durationMinutes = 0;
            sess.autoPunchedOut = true;
            sess.punchOutLocation = {
              latitude: null,
              longitude: null,
              address: "Auto punched out - Weekly Off",
              imageUrl: null,
            };
          }

          attendance.totalWorkingMinutes = 0;
          attendance.lastPunchOut = autoPunchOutTime;
          attendance.attendanceStatus = "WEEK_OFF";
          attendance.coreAttendanceStatus = "WEEK_OFF";
          attendance.status = "ABSENT";
          attendance.isHalfDay = false;
          attendance.halfDayType = null;

          const remark = `W/O Auto Out ${toLocalTime(autoPunchOutTime).format("HH:mm")}`;
          // const remark = `Auto punched out - Weekly Off (${toLocalTime(autoPunchOutTime).format("HH:mm:ss")})`;
          attendance.remarks = attendance.remarks ? `${attendance.remarks} | ${remark}` : remark;

          await attendance.save({ session: dbSession });
          updatedCount++;
          continue;
        }

        const openSessions = attendance.sessions.filter((s) => !s.punchOut);
        for (let i = 0; i < openSessions.length; i++) {
          const sess = openSessions[i];
          sess.punchOut = autoPunchOutTime;
          sess.autoPunchedOut = true;
          sess.punchOutLocation = {
            latitude: null,
            longitude: null,
            address: "Auto punched out by system – Employee forgot to punch out",
            imageUrl: null,
          };
        }

        console.log(`  ℹ️ FORGOT TO PUNCH OUT - Processing FULL DAY leave deduction (regardless of working hours)...`);
        forgotPunchOutCount++;

        const leaveResult = await processLeaveForDate(attendance.employee._id, yesterday, dbSession);

        let finalStatus = "ABSENT";

        if (leaveResult.status === "APPROVED") {
          onApprovedLeaveCount++;
          finalStatus = "ON_LEAVE";
          console.log(`  ℹ️ Employee on APPROVED full-day leave. Marked as ON_LEAVE.`);
        } else if (leaveResult.status === "PENDING_ALREADY_DEDUCTED") {
          pendingLeaveDeductedCount++;
          finalStatus = "ABSENT";
          console.log(`  ℹ️ PENDING full-day leave already deducted. Marked as ABSENT.`);
        } else if (leaveResult.status === "PENDING_DEDUCTED" || leaveResult.status === "NO_LEAVE_DEDUCTED") {
          fullDayDeductionCount++;
          if (leaveResult.status === "NO_LEAVE_DEDUCTED") {
            noLeaveDeductedCount++;
          }
          finalStatus = "ABSENT";
          console.log(`  ℹ️ Full-day leave deducted. Marked as ABSENT.`);
        } else {
          finalStatus = "ABSENT";
          console.log(`  ℹ️ No leave found. Marked as ABSENT.`);
        }

        attendance.attendanceStatus = finalStatus;
        attendance.coreAttendanceStatus = finalStatus;
        attendance.status = "ABSENT";
        attendance.isHalfDay = false;
        attendance.halfDayType = null;
        attendance.totalWorkingMinutes = 0;
        attendance.lastPunchOut = autoPunchOutTime;
        const remark = "Auto punch out - Forgot";
        // const remark = `Auto punched out at ${toLocalTime(autoPunchOutTime).format("HH:mm:ss")} - Employee forgot to punch out. FULL DAY leave deducted.`;
        attendance.remarks = attendance.remarks ? `${attendance.remarks} | ${remark}` : remark;

        await attendance.save({ session: dbSession });
        updatedCount++;

        console.log(`  ✅ ${empName}: status=${attendance.status}, attendanceStatus=${attendance.attendanceStatus} (Full day leave deducted - Forgot to punch out)`);

      } catch (err) {
        console.error(`  ❌ Error for ${attendance.employee?.fullName || attendance.employee}:`, err.message);
        errorCount++;
      }
    }

    // ================================================================
    // PROCESS SCENARIO 2: Employees with NO attendance (didn't punch in)
    // ALWAYS deduct FULL DAY leave
    // ================================================================
    for (const employee of employeesWithoutAttendance) {
      try {
        const empName = employee.fullName || String(employee);
        console.log(`\n📌 [NO PUNCH IN] Processing: ${empName}`);

        if (!employee.isActive) {
          console.log(`  ℹ️ Employee is inactive. Skipping...`);
          continue;
        }

        if (yesterdayWeekOff) {
          console.log(`  ℹ️ Yesterday was a WEEK OFF. Creating WEEK_OFF attendance record.`);
          weeklyOffCount++;

          let attendance = await Attendance.findOne({
            employee: employee._id,
            date: {
              $gte: yesterday,
              $lte: yesterdayEnd,
            },
          });

          if (!attendance) {
            attendance = new Attendance({
              employee: employee._id,
              date: yesterday,
              sessions: [],
              attendanceStatus: "WEEK_OFF",
              coreAttendanceStatus: "WEEK_OFF",
              status: "ABSENT",
              isHalfDay: false,
              halfDayType: null,
              totalWorkingMinutes: 0,
              remarks: "Weekly Off - No Punch",
            });
            console.log(`  ℹ️ Created new WEEK_OFF attendance record for ${empName}`);
          } else {
            attendance.attendanceStatus = "WEEK_OFF";
            attendance.coreAttendanceStatus = "WEEK_OFF";
            attendance.status = "ABSENT";
            attendance.isHalfDay = false;
            attendance.halfDayType = null;
            attendance.remarks = attendance.remarks
              ? `${attendance.remarks} | Weekly Off`
              : `Weekly Off`;
          }

          attendance.totalWorkingMinutes = 0;
          attendance.lastPunchOut = autoPunchOutTime;

          await attendance.save({ session: dbSession });
          updatedCount++;
          console.log(`  ✅ ${empName}: Marked as WEEK_OFF`);
          continue;
        }

        console.log(`  ℹ️ NO PUNCH IN - Processing full-day leave deduction...`);
        noPunchInCount++;

        const leaveResult = await processLeaveForDate(employee._id, yesterday, dbSession);

        let finalStatus = "ABSENT";

        if (leaveResult.status === "APPROVED") {
          onApprovedLeaveCount++;
          finalStatus = "ON_LEAVE";
          console.log(`  ℹ️ Employee on APPROVED full-day leave. Marked as ON_LEAVE.`);
        } else if (leaveResult.status === "PENDING_ALREADY_DEDUCTED") {
          pendingLeaveDeductedCount++;
          finalStatus = "ABSENT";
          console.log(`  ℹ️ PENDING full-day leave already deducted. Marked as ABSENT.`);
        } else if (leaveResult.status === "PENDING_DEDUCTED" || leaveResult.status === "NO_LEAVE_DEDUCTED") {
          fullDayDeductionCount++;
          if (leaveResult.status === "NO_LEAVE_DEDUCTED") {
            noLeaveDeductedCount++;
          }
          finalStatus = "ABSENT";
          console.log(`  ℹ️ Full-day leave deducted. Marked as ABSENT.`);
        } else {
          finalStatus = "ABSENT";
          console.log(`  ℹ️ No leave found. Marked as ABSENT.`);
        }

        let attendance = await Attendance.findOne({
          employee: employee._id,
          date: {
            $gte: yesterday,
            $lte: yesterdayEnd,
          },
        });

        if (!attendance) {
          attendance = new Attendance({
            employee: employee._id,
            date: yesterday,
            sessions: [],
            attendanceStatus: finalStatus,
            coreAttendanceStatus: finalStatus,
            status: "ABSENT",
            isHalfDay: false,
            halfDayType: null,
            totalWorkingMinutes: 0,
            remarks: `No punch in - ${finalStatus}`,
          });
          console.log(`  ℹ️ Created new attendance record for ${empName} with status: ${finalStatus}`);
        } else {
          if (attendance.attendanceStatus === "PRESENT" ||
            attendance.attendanceStatus === "ABSENT" ||
            attendance.attendanceStatus === "ON_LEAVE") {
            attendance.attendanceStatus = finalStatus;
            attendance.coreAttendanceStatus = finalStatus;
            attendance.status = "ABSENT";
            attendance.isHalfDay = false;
            attendance.halfDayType = null;
            attendance.remarks = (
              attendance.remarks
                ? `${attendance.remarks} | No punch - ${finalStatus}`
                : `No punch - ${finalStatus}`
            ).slice(0, 20);
            // attendance.remarks = attendance.remarks
            //   ? `${attendance.remarks} | No punch in. Marked as ${finalStatus} by system. FULL DAY leave deducted.`
            //   : `No punch in. Marked as ${finalStatus} by system. FULL DAY leave deducted.`;
            console.log(`  ℹ️ Updated existing attendance for ${empName} to status: ${finalStatus}`);
          } else {
            console.log(`  ℹ️ Existing attendance already has status: ${attendance.attendanceStatus}. Skipping update.`);
          }
        }

        attendance.totalWorkingMinutes = 0;
        attendance.lastPunchOut = autoPunchOutTime;

        await attendance.save({ session: dbSession });
        updatedCount++;

        console.log(`  ✅ ${empName}: status=${attendance.status}, attendanceStatus=${attendance.attendanceStatus}`);

      } catch (err) {
        console.error(`  ❌ Error for ${employee.fullName || employee}:`, err.message);
        errorCount++;
      }
    }

    // ================================================================
    // PROCESS SCENARIO 3: Employees with COMPLETED punch in AND punch out
    // USE EXACT SAME LOGIC AS evaluateAttendance AND DEDUCT LEAVE
    // ================================================================
    for (const attendance of completedAttendancesWithoutOpenSessions) {
      try {
        const empName = attendance.employee?.fullName || String(attendance.employee);
        console.log(`\n📌 [COMPLETED PUNCH IN/OUT] Processing: ${empName}`);

        if (!attendance.employee || !attendance.employee._id) {
          console.log(`  ❌ Employee not found or invalid. Skipping...`);
          errorCount++;
          continue;
        }

        const employee = await Employee.findById(attendance.employee._id);
        if (!employee || !employee.isActive) {
          console.log(`  ℹ️ Employee is inactive. Skipping...`);
          continue;
        }

        if (yesterdayWeekOff) {
          console.log(`  ℹ️ Yesterday was a WEEK OFF. Marking as WEEK_OFF.`);
          weeklyOffCount++;

          attendance.attendanceStatus = "WEEK_OFF";
          attendance.coreAttendanceStatus = "WEEK_OFF";
          attendance.status = "ABSENT";
          attendance.isHalfDay = false;
          attendance.halfDayType = null;
          attendance.totalWorkingMinutes = 0;
          attendance.lastPunchOut = autoPunchOutTime;

          const remark = `Weekly Off - Completed sessions overridden`;
          attendance.remarks = attendance.remarks ? `${attendance.remarks} | ${remark}` : remark;

          await attendance.save({ session: dbSession });
          updatedCount++;
          continue;
        }

        // ================================================================
        // USE EXACT SAME EVALUATION LOGIC AS evaluateAttendance
        // ================================================================

        // Get policy defaults (same as evaluateAttendance)
        const policy = {
          minimumFullDayMinutes: 480,
          minimumHalfDayMinutes: 240,
          maxLateAllowedPerMonth: 3
        };

        // Get employee with late counts
        const monthKey = moment(attendance.date).format("YYYY-MM");
        const monthLateCount = employee.lateCounts?.find((m) => m.month === monthKey)?.count || 0;

        // Create a temporary employee object with late counts for evaluation
        const empForEvaluation = {
          ...employee.toObject(),
          lateCounts: employee.lateCounts || []
        };

        // Call evaluateAttendance with the attendance and employee
        const evaluated = evaluateAttendance(attendance, policy, empForEvaluation);

        // Apply the evaluation result
        applyEvaluationResult(attendance, evaluated);

        // ================================================================
        // APPLY LEAVE DEDUCTION BASED ON EVALUATED STATUS
        // ================================================================
        const finalStatus = attendance.attendanceStatus;
        console.log(`  ℹ️ Evaluated Status: ${finalStatus}, isHalfDay: ${attendance.isHalfDay}, halfDayType: ${attendance.halfDayType}`);

        // Check if leave deduction is needed based on status
        if (finalStatus === "HALF_DAY") {
          console.log(`  ℹ️ HALF_DAY detected - Processing half-day leave deduction...`);

          // Check if employee has approved leave for this date
          const leaveResult = await processHalfDayLeaveDeduction(
            attendance.employee._id,
            yesterday,
            attendance.halfDayType || "FIRST_HALF",
            dbSession
          );

          if (leaveResult.status === "APPROVED") {
            onApprovedLeaveCount++;
            console.log(`  ℹ️ Employee on APPROVED half-day leave. No deduction needed.`);
          } else if (leaveResult.status === "PENDING_ALREADY_DEDUCTED") {
            pendingLeaveDeductedCount++;
            console.log(`  ℹ️ PENDING half-day leave already deducted.`);
          } else if (leaveResult.status === "HALF_DAY_DEDUCTED" || leaveResult.status === "PENDING_DEDUCTED") {
            halfDayDeductionCount++;
            if (leaveResult.status === "PENDING_DEDUCTED") {
              pendingLeaveDeductedCount++;
            }
            console.log(`  ✅ Half-day leave deducted from balance.`);
          } else {
            console.log(`  ⚠️ No leave found or deduction failed.`);
          }
        }
        else if (finalStatus === "SHORT_LEAVE") {
          console.log(`  ℹ️ SHORT_LEAVE detected - Processing short leave deduction...`);

          const leaveResult = await processShortLeaveForDate(
            attendance.employee._id,
            yesterday,
            dbSession
          );

          if (leaveResult.status === "APPROVED") {
            onApprovedLeaveCount++;
            console.log(`  ℹ️ Employee on APPROVED short leave. No deduction needed.`);
          } else if (leaveResult.status === "PENDING_ALREADY_DEDUCTED") {
            pendingLeaveDeductedCount++;
            console.log(`  ℹ️ PENDING short leave already deducted.`);
          } else if (leaveResult.status === "SHORT_LEAVE_DEDUCTED" || leaveResult.status === "PENDING_DEDUCTED") {
            shortLeaveDeductionCount++;
            if (leaveResult.status === "PENDING_DEDUCTED") {
              pendingLeaveDeductedCount++;
            }
            console.log(`  ✅ Short leave deducted from balance.`);
          } else {
            console.log(`  ⚠️ No leave found or deduction failed.`);
          }
        }
        else if (finalStatus === "ABSENT") {
          console.log(`  ℹ️ ABSENT detected - Processing full-day leave deduction...`);

          const leaveResult = await processLeaveForDate(
            attendance.employee._id,
            yesterday,
            dbSession
          );

          if (leaveResult.status === "APPROVED") {
            onApprovedLeaveCount++;
            console.log(`  ℹ️ Employee on APPROVED full-day leave. No deduction needed.`);
          } else if (leaveResult.status === "PENDING_ALREADY_DEDUCTED") {
            pendingLeaveDeductedCount++;
            console.log(`  ℹ️ PENDING full-day leave already deducted.`);
          } else if (leaveResult.status === "PENDING_DEDUCTED" || leaveResult.status === "NO_LEAVE_DEDUCTED") {
            fullDayDeductionCount++;
            if (leaveResult.status === "NO_LEAVE_DEDUCTED") {
              noLeaveDeductedCount++;
            }
            console.log(`  ✅ Full-day leave deducted from balance.`);
          } else {
            console.log(`  ⚠️ No leave found or deduction failed.`);
          }
        }
        else if (finalStatus === "PRESENT") {
          presentCount++;
          console.log(`  ℹ️ PRESENT - No leave deduction needed.`);
        }
        else if (finalStatus === "ON_LEAVE") {
          onApprovedLeaveCount++;
          console.log(`  ℹ️ ON_LEAVE - No leave deduction needed.`);
        }

        // Save the attendance with updated fields
        await attendance.save({ session: dbSession });
        updatedCount++;

        console.log(`  ✅ ${empName}: status=${attendance.status}, attendanceStatus=${finalStatus}, isHalfDay=${attendance.isHalfDay}, halfDayType=${attendance.halfDayType}`);

      } catch (err) {
        console.error(`  ❌ Error for ${attendance.employee?.fullName || attendance.employee}:`, err.message);
        errorCount++;
      }
    }

    await dbSession.commitTransaction();

    console.log("\n" + "=".repeat(60));
    console.log("AUTO PUNCH-OUT COMPLETED");
    console.log("=".repeat(60));
    console.log(`📊 SUMMARY:`);
    console.log(`  Total Active Employees: ${allEmployees.length}`);
    console.log(`  Employees Processed: ${employeesToProcess.length}`);
    console.log(`  Employees Skipped: ${employeesToSkip.length}`);
    console.log(`  🔴 Forgot to Punch Out: ${openAttendances.length} (FULL DAY deduction)`);
    console.log(`  🔴 No Punch In: ${employeesWithoutAttendance.length} (FULL DAY deduction)`);
    console.log(`  🟢 Completed Punch In/Out: ${completedAttendancesWithoutOpenSessions.length} (Evaluated with evaluateAttendance)`);
    console.log(`  ✅ Updated: ${updatedCount}`);
    console.log(`  📅 Weekly Off: ${weeklyOffCount}`);
    console.log(`  ✅ Present (Full Day Worked): ${presentCount}`);
    console.log(`  📋 On Approved Leave: ${onApprovedLeaveCount}`);
    console.log(`  ⏳ Pending Leave Already Deducted: ${pendingLeaveDeductedCount}`);
    console.log(`  💰 Full Day Leave Deductions: ${fullDayDeductionCount}`);
    console.log(`  🔶 Half Day Deductions: ${halfDayDeductionCount}`);
    console.log(`  ⏱️ Short Leave Deductions: ${shortLeaveDeductionCount}`);
    console.log(`    - No Leave Found (Deducted from Balance): ${noLeaveDeductedCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      totalActiveEmployees: allEmployees.length,
      employeesProcessed: employeesToProcess.length,
      employeesSkipped: employeesToSkip.length,
      forgotToPunchOut: openAttendances.length,
      noPunchIn: employeesWithoutAttendance.length,
      completedPunchInOut: completedAttendancesWithoutOpenSessions.length,
      updated: updatedCount,
      weeklyOff: weeklyOffCount,
      present: presentCount,
      onApprovedLeave: onApprovedLeaveCount,
      pendingLeaveAlreadyDeducted: pendingLeaveDeductedCount,
      fullDayDeductions: fullDayDeductionCount,
      halfDayDeductions: halfDayDeductionCount,
      shortLeaveDeductions: shortLeaveDeductionCount,
      noLeaveDeducted: noLeaveDeductedCount,
      errors: errorCount,
      date: yesterday,
      message: "All employees have been processed successfully"
    };

  } catch (err) {
    await dbSession.abortTransaction();
    console.error("❌ CRON JOB ERROR:", err);
    throw err;
  } finally {
    dbSession.endSession();
  }
};

module.exports = {
  autoPunchOutMissedEmployees,
};