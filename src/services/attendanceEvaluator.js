const moment = require("moment");

// ============================================================================
// OFFICE TIMING CONSTANTS (IST / Local Time)
// ============================================================================
const OFFICE_START = "09:31";
const GRACE_END = "09:46";
const MORNING_SHORT_LEAVE_END = "11:46";
const FIRST_HALF_END = "14:01";
const SECOND_HALF_START = "14:01";
const SECOND_HALF_GRACE_END = "14:16";
const EVENING_SHORT_LEAVE_START = "16:30";
const OFFICE_END = "18:30";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const toLocalTime = (utcDate) => moment(utcDate).utcOffset("+05:30");

const getLocalMomentTime = (baseDay, timeString) => {
  const [hours, minutes] = timeString.split(":").map(Number);
  return moment(baseDay).utcOffset("+05:30").hour(hours).minute(minutes).second(0).millisecond(0);
};

const calculateTotalWorkingMinutes = (sessions) => {
  let total = 0;
  for (const s of sessions) {
    if (s.punchOut && s.durationMinutes && s.durationMinutes > 0) {
      total += s.durationMinutes;
    }
  }
  return total;
};

const getFirstPunchIn = (sessions) => {
  if (!sessions || sessions.length === 0) return null;
  return [...sessions].sort((a, b) => new Date(a.punchIn) - new Date(b.punchIn))[0].punchIn;
};

const getLastPunchOut = (sessions) => {
  const completed = sessions.filter((s) => s.punchOut);
  if (completed.length === 0) return null;
  return [...completed].sort((a, b) => new Date(b.punchOut) - new Date(a.punchOut))[0].punchOut;
};

const hasActiveSession = (sessions) => sessions.some((s) => !s.punchOut);

// ============================================================================
// DETERMINE CORE STATUS BASED ON FIRST PUNCH TIME (ONLY ON FIRST EVALUATION)
// ============================================================================
const determineCoreStatusByFirstPunch = (firstPunch, shiftStart, graceEnd, morningShortEnd, secondHalfStart, secondHalfGraceEnd, monthLateCount, maxLateAllowed) => {

  console.log(`\n🔍 Determining CORE status from first punch: ${firstPunch.format("HH:mm:ss")}`);

  // Case 1: Arrived after 2:15 PM
  if (firstPunch.isAfter(secondHalfGraceEnd)) {
    console.log(`   → CORE = ABSENT (arrived after 2:15 PM)`);
    return "ABSENT";
  }

  // Case 2: Arrived between 11:45 - 14:00 (First Half Day)
  if (firstPunch.isAfter(morningShortEnd) && firstPunch.isBefore(secondHalfStart)) {
    console.log(`   → CORE = HALF_DAY (FIRST_HALF)`);
    return "HALF_DAY";
  }

  // Case 3: Arrived between 14:00 - 14:15 (Second Half Day)
  if (firstPunch.isSameOrAfter(secondHalfStart) && firstPunch.isSameOrBefore(secondHalfGraceEnd)) {
    console.log(`   → CORE = HALF_DAY (SECOND_HALF)`);
    return "HALF_DAY";
  }

  // Case 4: Arrived after shift start but before 11:45
  if (firstPunch.isAfter(shiftStart)) {
    const lateMins = firstPunch.diff(shiftStart, "minutes");

    // Grace period (09:30 - 09:45) with exceeded limit
    if (firstPunch.isSameOrBefore(graceEnd) && monthLateCount >= maxLateAllowed) {
      console.log(`   → CORE = SHORT_LEAVE (grace arrival, limit exceeded)`);
      return "SHORT_LEAVE";
    }

    // Short leave window (09:45 - 11:45)
    if (firstPunch.isAfter(graceEnd) && firstPunch.isSameOrBefore(morningShortEnd)) {
      console.log(`   → CORE = SHORT_LEAVE (short leave window)`);
      return "SHORT_LEAVE";
    }
  }

  // Default: On time or early
  console.log(`   → CORE = PRESENT`);
  return "PRESENT";
};

// ============================================================================
// GET HALF DAY TYPE
// ============================================================================
const getHalfDayType = (firstPunch, morningShortEnd, secondHalfStart, secondHalfGraceEnd) => {
  if (firstPunch.isAfter(morningShortEnd) && firstPunch.isBefore(secondHalfStart)) {
    return "FIRST_HALF";
  }
  if (firstPunch.isSameOrAfter(secondHalfStart) && firstPunch.isSameOrBefore(secondHalfGraceEnd)) {
    return "SECOND_HALF";
  }
  return null;
};

// ============================================================================
// GET SHORT LEAVE DETAILS
// ============================================================================
const getShortLeaveDetails = (firstPunch, shiftStart, graceEnd, morningShortEnd, monthLateCount, maxLateAllowed) => {
  if (!firstPunch.isAfter(shiftStart)) {
    return { isShortLeave: false, minutes: 0 };
  }

  const lateMins = firstPunch.diff(shiftStart, "minutes");

  // Grace period with exceeded limit
  if (firstPunch.isSameOrBefore(graceEnd) && monthLateCount >= maxLateAllowed) {
    return { isShortLeave: true, minutes: lateMins };
  }

  // Short leave window
  if (firstPunch.isAfter(graceEnd) && firstPunch.isSameOrBefore(morningShortEnd)) {
    return { isShortLeave: true, minutes: lateMins };
  }

  return { isShortLeave: false, minutes: 0 };
};

// ============================================================================
// CHECK IF EVENING SHORT LEAVE APPLIES
// ============================================================================
const isEveningShortLeave = (lastPunch, shiftEnd, eveningShortStart) => {
  if (!lastPunch) return false;
  return lastPunch.isSameOrAfter(eveningShortStart) && lastPunch.isBefore(shiftEnd);
};

// ============================================================================
// MAIN EVALUATION FUNCTION
// ============================================================================

const evaluateAttendance = (attendance, policy, employee) => {
  console.log("=".repeat(60));
  console.log("EVALUATING ATTENDANCE");
  console.log("=".repeat(60));
  console.log("Date:", attendance?.date);
  console.log("Current attendanceStatus:", attendance?.attendanceStatus);
  console.log("Stored coreStatus:", attendance?.coreAttendanceStatus);
  console.log("Total sessions:", attendance?.sessions?.length);

  // ========================================================================
  // CASE 1: NO SESSIONS AT ALL
  // ========================================================================
  if (!attendance.sessions || attendance.sessions.length === 0) {
    attendance.status = "ABSENT";
    attendance.attendanceStatus = "ABSENT";
    attendance.coreAttendanceStatus = "ABSENT";
    console.log("No sessions → ABSENT");
    return attendance;
  }

  // ========================================================================
  // GET SESSION DATA
  // ========================================================================
  const allSessions = attendance.sessions;
  const completedSessions = allSessions.filter((s) => s.punchOut);
  const hasActive = hasActiveSession(allSessions);

  // REAL-TIME STATUS
  attendance.status = hasActive ? "PRESENT" : "ABSENT";

  console.log(`\n📊 Session Summary:`);
  console.log(`   Total sessions: ${allSessions.length}`);
  console.log(`   Completed sessions: ${completedSessions.length}`);
  console.log(`   Active session: ${hasActive}`);
  console.log(`   Real-time status: ${attendance.status}`);

  allSessions.forEach((s, i) => {
    console.log(
      `   Session ${i + 1}: IN=${toLocalTime(s.punchIn).format("HH:mm:ss")}, ` +
      `OUT=${s.punchOut ? toLocalTime(s.punchOut).format("HH:mm:ss") : "ACTIVE"}, ` +
      `DUR=${s.durationMinutes || 0}`
    );
  });

  // ========================================================================
  // SHIFT BOUNDARIES
  // ========================================================================
  const day = moment(attendance.date).utcOffset("+05:30").startOf("day");
  const shiftStart = getLocalMomentTime(day, OFFICE_START);
  const graceEnd = getLocalMomentTime(day, GRACE_END);
  const morningShortEnd = getLocalMomentTime(day, MORNING_SHORT_LEAVE_END);
  const firstHalfEnd = getLocalMomentTime(day, FIRST_HALF_END);
  const secondHalfStart = getLocalMomentTime(day, SECOND_HALF_START);
  const secondHalfGraceEnd = getLocalMomentTime(day, SECOND_HALF_GRACE_END);
  const eveningShortStart = getLocalMomentTime(day, EVENING_SHORT_LEAVE_START);
  const shiftEnd = getLocalMomentTime(day, OFFICE_END);

  // ========================================================================
  // FIRST PUNCH OF THE DAY
  // ========================================================================
  const firstPunchUTC = getFirstPunchIn(allSessions);
  const firstPunch = toLocalTime(firstPunchUTC);
  attendance.firstPunchIn = firstPunchUTC;

  console.log(`\n📌 FIRST PUNCH: ${firstPunch.format("HH:mm:ss")}`);

  // Monthly late count
  const monthKey = moment(attendance.date).format("YYYY-MM");
  const monthLateCount = employee?.lateCounts?.find((m) => m.month === monthKey)?.count || 0;
  const maxLateAllowed = policy.maxLateAllowedPerMonth || 3;
  console.log(`   Monthly late used: ${monthLateCount}/${maxLateAllowed}`);

  // ========================================================================
  // CHECK FOR ARRIVAL AFTER 2:15 PM
  // ========================================================================
  if (firstPunch.isAfter(secondHalfGraceEnd)) {
    attendance.attendanceStatus = "ABSENT";
    attendance.coreAttendanceStatus = "ABSENT";
    attendance.status = hasActive ? "PRESENT" : "ABSENT";
    console.log(`\n❌ Arrived after 2:15 PM → ABSENT`);
    return attendance;
  }

  // ========================================================================
  // STORE CORE STATUS (ONLY ONCE - PERSISTS ACROSS SAVES)
  // ========================================================================
  if (!attendance.coreAttendanceStatus) {
    const coreStatus = determineCoreStatusByFirstPunch(
      firstPunch, shiftStart, graceEnd, morningShortEnd,
      secondHalfStart, secondHalfGraceEnd, monthLateCount, maxLateAllowed
    );
    attendance.coreAttendanceStatus = coreStatus;
    attendance.coreHalfDayType = getHalfDayType(firstPunch, morningShortEnd, secondHalfStart, secondHalfGraceEnd);

    const shortLeaveDetails = getShortLeaveDetails(firstPunch, shiftStart, graceEnd, morningShortEnd, monthLateCount, maxLateAllowed);
    attendance.coreMorningShortLeave = {
      isShortLeave: shortLeaveDetails.isShortLeave,
      minutes: shortLeaveDetails.minutes,
    };

    attendance.coreIsLate = firstPunch.isAfter(shiftStart) && !shortLeaveDetails.isShortLeave;
    attendance.coreLateMinutes = attendance.coreIsLate ? firstPunch.diff(shiftStart, "minutes") : 0;

    console.log(`\n✅ CORE STATUS STORED: ${attendance.coreAttendanceStatus}`);
    if (attendance.coreHalfDayType) console.log(`   Half day type: ${attendance.coreHalfDayType}`);
    if (attendance.coreMorningShortLeave?.isShortLeave) console.log(`   Morning short leave: ${attendance.coreMorningShortLeave.minutes} min`);
  } else {
    console.log(`\n✅ USING STORED CORE STATUS: ${attendance.coreAttendanceStatus}`);
  }

  // ========================================================================
  // APPLY CORE STATUS FLAGS
  // ========================================================================
  attendance.isHalfDay = (attendance.coreAttendanceStatus === "HALF_DAY");
  attendance.halfDayType = attendance.coreHalfDayType;
  attendance.morningShortLeave = attendance.coreMorningShortLeave || { isShortLeave: false, minutes: 0 };
  attendance.isLate = attendance.coreIsLate || false;
  attendance.lateMinutes = attendance.coreLateMinutes || 0;

  // ========================================================================
  // CALCULATE TOTAL WORKING MINUTES
  // ========================================================================
  const workingMinutes = calculateTotalWorkingMinutes(completedSessions);
  attendance.totalWorkingMinutes = workingMinutes;

  let breakMinutes = 0;
  for (const s of completedSessions) {
    if (s.breaks?.length)
      for (const br of s.breaks) breakMinutes += br.durationMinutes || 0;
  }
  attendance.totalBreakMinutes = breakMinutes;
  attendance.breakCount = completedSessions.reduce((c, s) => c + (s.breaks?.length || 0), 0);

  console.log(`\n📊 TOTAL WORKING MINUTES: ${workingMinutes}`);

  // ========================================================================
  // LAST PUNCH OUT & EVENING SHORT LEAVE
  // ========================================================================
  const lastPunchOutUTC = getLastPunchOut(completedSessions);
  let eveningShortLeaveFlag = false;
  let eveningShortLeaveMinutes = 0;
  let lastPunchLocal = null;

  if (lastPunchOutUTC) {
    attendance.lastPunchOut = lastPunchOutUTC;
    lastPunchLocal = toLocalTime(lastPunchOutUTC);
    console.log(`📌 LAST PUNCH OUT: ${lastPunchLocal.format("HH:mm:ss")}`);

    if (lastPunchLocal.isSameOrAfter(eveningShortStart) && lastPunchLocal.isBefore(shiftEnd)) {
      const shortLeaveMins = shiftEnd.diff(lastPunchLocal, "minutes");
      if (shortLeaveMins > 0 && shortLeaveMins <= 120) {
        eveningShortLeaveFlag = true;
        eveningShortLeaveMinutes = shortLeaveMins;
        console.log(`   Evening short leave: ${shortLeaveMins} min`);
      }
    }
  }

  attendance.eveningShortLeave = {
    isShortLeave: eveningShortLeaveFlag,
    minutes: eveningShortLeaveMinutes,
  };

  // ========================================================================
  // DETERMINE FINAL attendanceStatus
  // ========================================================================

  const minFullDay = policy.minimumFullDayMinutes || 480;
  const minHalfDay = policy.minimumHalfDayMinutes || 240;
  const coreStatus = attendance.coreAttendanceStatus;
  const hasMorningShortLeaveFlag = attendance.morningShortLeave?.isShortLeave || false;
  const hasEveningShortLeaveFlag = eveningShortLeaveFlag;
  const hasShortLeaveFlag = hasMorningShortLeaveFlag || hasEveningShortLeaveFlag;

  console.log(`\n🎯 Core Status: ${coreStatus}`);
  console.log(`   Has Morning Short Leave: ${hasMorningShortLeaveFlag}`);
  console.log(`   Has Evening Short Leave: ${hasEveningShortLeaveFlag}`);
  console.log(`   Has Active Session: ${hasActive}`);

  // ========================================================================
  // RULE 1: If there's an active session (punched in), show CORE STATUS
  // ========================================================================
  if (hasActive) {
    attendance.attendanceStatus = coreStatus;
    console.log(`\n✅ Active session present → Showing CORE STATUS: ${attendance.attendanceStatus}`);
  }
  // ========================================================================
  // RULE 2: No active session - evaluate based on working minutes and flags
  // ========================================================================
  else {
    // CASE A: Core status is HALF_DAY
    if (coreStatus === "HALF_DAY") {
      if (workingMinutes < 30) {
        attendance.attendanceStatus = "ABSENT";
        console.log(`\n❌ Core is HALF_DAY but worked only ${workingMinutes}m (< 30) → ABSENT`);
      } else {
        attendance.attendanceStatus = "HALF_DAY";
        console.log(`\n✅ Core is HALF_DAY, worked ${workingMinutes}m → HALF_DAY`);
      }
    }
    // CASE B: Core status is SHORT_LEAVE
    else if (coreStatus === "SHORT_LEAVE") {
      if (workingMinutes >= minFullDay) {
        attendance.attendanceStatus = "SHORT_LEAVE";
        console.log(`\n✅ Worked full day (${workingMinutes}m) → SHORT_LEAVE`);
      } else if (workingMinutes >= minHalfDay) {
        attendance.attendanceStatus = "SHORT_LEAVE";
        console.log(`\n✅ Worked half day (${workingMinutes}m) → SHORT_LEAVE`);
      } else if (workingMinutes > 0) {
        attendance.attendanceStatus = "ABSENT";
        console.log(`\n❌ Worked only ${workingMinutes}m (< half day) → ABSENT`);
      } else {
        attendance.attendanceStatus = "ABSENT";
        console.log(`\n❌ No working minutes → ABSENT`);
      }
    }
    // CASE C: Core status is PRESENT
    else if (coreStatus === "PRESENT") {
      // IMPORTANT: Check for evening short leave first
      if (hasEveningShortLeaveFlag && workingMinutes >= minHalfDay && workingMinutes < minFullDay) {
        attendance.attendanceStatus = "SHORT_LEAVE";
        console.log(`\n✅ Evening short leave detected (left at ${lastPunchLocal?.format("HH:mm:ss")}) → SHORT_LEAVE`);
      }
      // Check for morning short leave
      else if (hasMorningShortLeaveFlag && workingMinutes >= minHalfDay && workingMinutes < minFullDay) {
        attendance.attendanceStatus = "SHORT_LEAVE";
        console.log(`\n✅ Morning short leave detected → SHORT_LEAVE`);
      }
      else if (workingMinutes >= minFullDay) {
        attendance.attendanceStatus = hasShortLeaveFlag ? "SHORT_LEAVE" : "PRESENT";
        console.log(`\n✅ Worked full day (${workingMinutes}m) → ${attendance.attendanceStatus}`);
      }
      else if (workingMinutes >= minHalfDay) {
        attendance.attendanceStatus = "HALF_DAY";
        attendance.isHalfDay = true;
        // Determine half day type based on which half was missed
        const morningWorked = calculateMorningWorked(completedSessions, shiftStart, firstHalfEnd);
        const afternoonWorked = calculateAfternoonWorked(completedSessions, secondHalfStart, shiftEnd);
        attendance.halfDayType = morningWorked < afternoonWorked ? "FIRST_HALF" : "SECOND_HALF";
        console.log(`\n⚠️ Worked half day (${workingMinutes}m) → HALF_DAY (${attendance.halfDayType})`);
      }
      else if (workingMinutes > 0) {
        attendance.attendanceStatus = "ABSENT";
        console.log(`\n❌ Worked only ${workingMinutes}m (< half day) → ABSENT`);
      }
      else {
        attendance.attendanceStatus = "ABSENT";
        console.log(`\n❌ No working minutes → ABSENT`);
      }
    }
    // CASE D: Core status is ABSENT
    else {
      attendance.attendanceStatus = "ABSENT";
      console.log(`\n❌ Core status is ABSENT → ABSENT`);
    }
  }

  // ========================================================================
  // FINAL OUTPUT
  // ========================================================================
  console.log("\n" + "=".repeat(60));
  console.log(`FINAL RESULT:`);
  console.log(`  status (real-time): ${attendance.status}`);
  console.log(`  attendanceStatus (HR verdict): ${attendance.attendanceStatus}`);
  console.log(`  coreAttendanceStatus: ${attendance.coreAttendanceStatus}`);
  console.log(`  totalWorkingMinutes: ${attendance.totalWorkingMinutes}`);
  if (attendance.isHalfDay) console.log(`  halfDayType: ${attendance.halfDayType}`);
  if (attendance.morningShortLeave?.isShortLeave) console.log(`  morningShortLeave: ${attendance.morningShortLeave.minutes} min`);
  if (attendance.eveningShortLeave?.isShortLeave) console.log(`  eveningShortLeave: ${attendance.eveningShortLeave.minutes} min`);
  console.log("=".repeat(60) + "\n");

  return attendance;
};

// ============================================================================
// ADD MISSING HELPER FUNCTIONS
// ============================================================================
const calculateMorningWorked = (sessions, shiftStart, firstHalfEnd) => {
  let minutes = 0;
  for (const s of sessions) {
    if (!s.punchOut) continue;
    const start = toLocalTime(s.punchIn);
    const end = toLocalTime(s.punchOut);
    if (end.isAfter(shiftStart) && start.isBefore(firstHalfEnd)) {
      minutes += Math.max(0, moment.min(end, firstHalfEnd).diff(moment.max(start, shiftStart), "minutes"));
    }
  }
  return minutes;
};

const calculateAfternoonWorked = (sessions, secondHalfStart, shiftEnd) => {
  let minutes = 0;
  for (const s of sessions) {
    if (!s.punchOut) continue;
    const start = toLocalTime(s.punchIn);
    const end = toLocalTime(s.punchOut);
    if (end.isAfter(secondHalfStart) && start.isBefore(shiftEnd)) {
      minutes += Math.max(0, moment.min(end, shiftEnd).diff(moment.max(start, secondHalfStart), "minutes"));
    }
  }
  return minutes;
};

module.exports = { evaluateAttendance };