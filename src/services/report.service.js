// services/report.service.js - COMPLETE WORKING VERSION

const mongoose = require("mongoose");
const NodeCache = require('node-cache');

const Employee = require("../models/employee.model");
const Attendance = require("../models/attendance.model");
const Leave = require("../models/leave.model");

// ====================================================================
// CONFIGURATION
// ====================================================================

const WEEKEND_DAYS = [0, 6];
const CACHE_TTL = 1800; // 30 minutes
const CACHE_CHECK_PERIOD = 600; // 10 minutes

// ====================================================================
// CACHE SETUP
// ====================================================================

const cache = new NodeCache({
    stdTTL: CACHE_TTL,
    checkperiod: CACHE_CHECK_PERIOD,
    maxKeys: 1000,
    useClones: false
});

// ====================================================================
// UTILITY FUNCTIONS
// ====================================================================

const isWeekOff = (date) => WEEKEND_DAYS.includes(date.getDay());

const pad2 = (n) => String(n).padStart(2, "0");

const toDateKey = (d) => {
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const ms = (start) => Number(process.hrtime.bigint() - start) / 1e6;

const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
};

const getCurrentMonthString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
};

// ====================================================================
// DATE RANGE RESOLUTION
// ====================================================================

const resolveMonthRange = (month) => {
    const now = new Date();
    let year, monthIndex;

    if (month) {
        const [y, m] = month.split("-").map(Number);
        year = y;
        monthIndex = m - 1;
    } else {
        year = now.getFullYear();
        monthIndex = now.getMonth();
    }

    const fromDate = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    let toDate = new Date(year, monthIndex, lastDay, 23, 59, 59, 999);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    if (fromDate > todayEnd) {
        const err = new Error("Cannot fetch attendance for a future month");
        err.statusCode = 400;
        throw err;
    }
    if (toDate > todayEnd) {
        toDate = todayEnd;
    }

    return { fromDate, toDate };
};

// ====================================================================
// ATTENDANCE FETCH FUNCTION - SIMPLIFIED & RELIABLE
// ====================================================================

const ATTENDANCE_PROJECTION = {
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
    coreHalfDayType: 1,
    remarks: 1
};

/**
 * FETCH ATTENDANCE - USING SIMPLE find() WITH CHUNKING
 * This avoids aggregation complexity and connection pool issues
 */
const fetchAttendanceOptimized = async (employeeIds, fromDate, toDate) => {
    const start = process.hrtime.bigint();
    console.log(`[Attendance] Fetching for ${employeeIds.length} employees`);

    try {
        // Convert to ObjectIds if needed
        const objectIds = employeeIds.map(id => 
            typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
        );

        // Use simple find() with proper indexing
        const records = await Attendance.find({
            employee: { $in: objectIds },
            date: { $gte: fromDate, $lte: toDate }
        })
        .select(ATTENDANCE_PROJECTION)
        .lean()
        .maxTimeMS(120000); // 2 minutes timeout

        const duration = ms(start);
        console.log(`[Attendance] Found ${records.length} records in ${duration.toFixed(1)}ms`);

        return records;

    } catch (error) {
        console.error(`[Attendance] Query failed: ${error.message}`);
        console.log('[Attendance] Falling back to chunked query...');

        // If query fails, try chunked approach to avoid connection pool timeout
        const chunks = chunkArray(employeeIds, 100);
        let allRecords = [];

        for (let i = 0; i < chunks.length; i++) {
            console.log(`[Attendance] Processing chunk ${i + 1}/${chunks.length}`);
            
            try {
                const chunkRecords = await Attendance.find({
                    employee: { $in: chunks[i] },
                    date: { $gte: fromDate, $lte: toDate }
                })
                .select(ATTENDANCE_PROJECTION)
                .lean()
                .maxTimeMS(60000); // 1 minute per chunk

                allRecords = allRecords.concat(chunkRecords);
                console.log(`[Attendance] Chunk ${i + 1} returned ${chunkRecords.length} records`);
            } catch (chunkError) {
                console.error(`[Attendance] Chunk ${i + 1} failed: ${chunkError.message}`);
                // Continue with other chunks
            }
        }

        const duration = ms(start);
        console.log(`[Attendance] Found ${allRecords.length} records (chunked) in ${duration.toFixed(1)}ms`);
        
        return allRecords;
    }
};

// ====================================================================
// MAIN SERVICE FUNCTION
// ====================================================================

const getMonthlyAttendance = async ({ month, employeeId, cacheKey = null }) => {
    const TOTAL_START = process.hrtime.bigint();
    console.log("[getMonthlyAttendance] START — month:", month, "employeeId:", employeeId);

    // Generate cache key
    const effectiveCacheKey = cacheKey || `attendance_${month || 'current'}_${employeeId || 'all'}`;

    // Check cache
    const cachedResult = cache.get(effectiveCacheKey);
    if (cachedResult) {
        console.log("[Cache] HIT for key:", effectiveCacheKey);
        return { ...cachedResult, fromCache: true };
    }

    console.log("[Cache] MISS for key:", effectiveCacheKey);

    const { fromDate, toDate } = resolveMonthRange(month);

    // Build employee query
    const employeeQuery = employeeId
        ? { _id: employeeId, isActive: true }
        : { isActive: true };

    // Fetch employees
    const EMPLOYEE_START = process.hrtime.bigint();
    const employees = await Employee.find(employeeQuery)
        .select("employeeCode fullName email department designation reportingTo joiningDate")
        .populate([
            { path: "department", select: "name" },
            { path: "designation", select: "title" },
            { path: "reportingTo", select: "fullName employeeCode" }
        ])
        .sort({ fullName: 1 })
        .lean()
        .maxTimeMS(10000);

    console.log(`[Employee] Count: ${employees.length}, duration: ${ms(EMPLOYEE_START).toFixed(1)}ms`);

    if (employeeId && !employees.length) {
        const err = new Error("Employee not found or inactive");
        err.statusCode = 404;
        throw err;
    }

    if (!employees.length) {
        const result = {
            fromDate: toDateKey(fromDate),
            toDate: toDateKey(toDate),
            totalEmployees: 0,
            totalDays: 0,
            employees: [],
            fromCache: false
        };
        cache.set(effectiveCacheKey, result);
        return result;
    }

    const employeeIds = employees.map((e) => e._id);

    // Fetch attendance
    const ATTENDANCE_START = process.hrtime.bigint();
    const attendanceRecords = await fetchAttendanceOptimized(employeeIds, fromDate, toDate);
    console.log(`[Attendance] Total records: ${attendanceRecords.length}, duration: ${ms(ATTENDANCE_START).toFixed(1)}ms`);

    // Fetch leaves
    const LEAVE_START = process.hrtime.bigint();

    const [leavesWithEndDate, leavesWithoutEndDate] = await Promise.all([
        Leave.find({
            employee: { $in: employeeIds },
            status: "APPROVED",
            startDate: { $lte: toDate },
            endDate: { $gte: fromDate }
        })
        .select("employee startDate endDate")
        .lean()
        .maxTimeMS(5000),

        Leave.find({
            employee: { $in: employeeIds },
            status: "APPROVED",
            startDate: { $lte: toDate },
            endDate: null
        })
        .select("employee startDate endDate")
        .lean()
        .maxTimeMS(5000)
    ]);

    const approvedLeaves = [...leavesWithEndDate, ...leavesWithoutEndDate];
    console.log(`[Leave] Count: ${approvedLeaves.length}, duration: ${ms(LEAVE_START).toFixed(1)}ms`);

    // Build attendance map
    const attendanceMap = {};
    for (const rec of attendanceRecords) {
        const empId = rec.employee.toString();
        const dateKey = toDateKey(rec.date);
        if (!attendanceMap[empId]) attendanceMap[empId] = {};
        attendanceMap[empId][dateKey] = rec;
    }

    // Build leave map
    const leaveMap = {};
    for (const leave of approvedLeaves) {
        const empId = leave.employee.toString();
        if (!leaveMap[empId]) leaveMap[empId] = new Set();

        const start = new Date(leave.startDate);
        const end = leave.endDate ? new Date(leave.endDate) : new Date(leave.startDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            leaveMap[empId].add(toDateKey(d));
        }
    }

    // Generate all dates
    const allDates = [];
    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= toDate) {
        allDates.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    // Build result
    const RESULT_START = process.hrtime.bigint();
    const result = employees.map((employee) => {
        const empId = employee._id.toString();
        const joiningDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
        if (joiningDate) joiningDate.setHours(0, 0, 0, 0);

        const summary = {
            present: 0, absent: 0, halfDay: 0, shortLeave: 0,
            weekOff: 0, holiday: 0, onLeave: 0, notJoined: 0
        };

        const attendance = allDates.map((dateKey) => {
            const record = attendanceMap?.[empId]?.[dateKey];
            let status, coreStatus;

            if (record) {
                // FIX: Check both attendanceStatus and coreAttendanceStatus
                coreStatus = record.coreAttendanceStatus || record.attendanceStatus || record.status || "ABSENT";
                status = coreStatus;
            } else {
                const reportDate = new Date(dateKey);
                reportDate.setHours(0, 0, 0, 0);

                if (joiningDate && reportDate < joiningDate) {
                    status = "NOT_JOINED";
                } else if (isWeekOff(reportDate)) {
                    status = "WEEK_OFF";
                } else if (leaveMap?.[empId]?.has(dateKey)) {
                    status = "ON_LEAVE";
                } else {
                    status = "ABSENT";
                }
                coreStatus = status;
            }

            // Normalize status
            const normalized = status ? status.toUpperCase().trim() : "ABSENT";

            // Update summary
            if (normalized.includes("PRESENT")) {
                summary.present++;
            } else if (normalized === "ABSENT") {
                summary.absent++;
            } else if (normalized === "HALF_DAY" || normalized === "HALFDAY") {
                summary.halfDay++;
            } else if (normalized === "SHORT_LEAVE" || normalized === "SHORTLEAVE") {
                summary.shortLeave++;
            } else if (normalized === "WEEK_OFF") {
                summary.weekOff++;
            } else if (normalized === "HOLIDAY") {
                summary.holiday++;
            } else if (normalized === "ON_LEAVE") {
                summary.onLeave++;
            } else if (normalized === "NOT_JOINED") {
                summary.notJoined++;
            } else {
                summary.absent++;
            }

            return {
                date: dateKey,
                attendanceStatus: normalized,
                coreAttendanceStatus: coreStatus,
                firstPunchIn: record?.firstPunchIn || null,
                lastPunchOut: record?.lastPunchOut || null,
                totalWorkingMinutes: record?.totalWorkingMinutes || 0,
                totalBreakMinutes: record?.totalBreakMinutes || 0,
                breakCount: record?.breakCount || 0,
                isLate: record?.isLate || record?.coreIsLate || false,
                lateMinutes: record?.lateMinutes || record?.coreLateMinutes || 0,
                isHalfDay: record?.isHalfDay || record?.coreIsHalfDay || false,
                halfDayType: record?.halfDayType || record?.coreHalfDayType || null,
                remarks: record?.remarks || null
            };
        });

        return {
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
        };
    });

    console.log(`[Result] Built ${result.length} employees, duration: ${ms(RESULT_START).toFixed(1)}ms`);

    const totalDuration = ms(TOTAL_START);
    console.log(`[getMonthlyAttendance] TOTAL: ${totalDuration.toFixed(1)}ms (${(totalDuration / 1000).toFixed(2)}s)`);

    // Prepare response
    const response = {
        fromDate: toDateKey(fromDate),
        toDate: toDateKey(toDate),
        totalEmployees: result.length,
        totalDays: allDates.length,
        employees: result,
        fromCache: false,
        performance: {
            totalMs: totalDuration,
            employeeMs: ms(EMPLOYEE_START),
            attendanceMs: ms(ATTENDANCE_START),
            leaveMs: ms(LEAVE_START),
            resultMs: ms(RESULT_START)
        }
    };

    // Cache the result
    const isCurrentMonth = month === getCurrentMonthString();
    const ttl = isCurrentMonth ? 300 : CACHE_TTL;
    cache.set(effectiveCacheKey, response, ttl);

    return response;
};

// ====================================================================
// PAGINATED VERSION
// ====================================================================

const getMonthlyAttendancePaginated = async ({
    month,
    employeeId,
    page = 1,
    limit = 50,
    sortBy = 'fullName',
    sortOrder = 'asc'
}) => {
    const { fromDate, toDate } = resolveMonthRange(month);

    const employeeQuery = employeeId
        ? { _id: employeeId, isActive: true }
        : { isActive: true };

    const totalEmployees = await Employee.countDocuments(employeeQuery);

    const employees = await Employee.find(employeeQuery)
        .select("employeeCode fullName email department designation reportingTo joiningDate")
        .populate([
            { path: "department", select: "name" },
            { path: "designation", select: "title" },
            { path: "reportingTo", select: "fullName employeeCode" }
        ])
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .maxTimeMS(10000);

    if (!employees.length) {
        return {
            fromDate: toDateKey(fromDate),
            toDate: toDateKey(toDate),
            totalEmployees: 0,
            employees: [],
            page,
            limit
        };
    }

    const employeeIds = employees.map((e) => e._id);
    const attendanceRecords = await fetchAttendanceOptimized(employeeIds, fromDate, toDate);

    const attendanceMap = {};
    for (const rec of attendanceRecords) {
        const empId = rec.employee.toString();
        const dateKey = toDateKey(rec.date);
        if (!attendanceMap[empId]) attendanceMap[empId] = {};
        attendanceMap[empId][dateKey] = rec;
    }

    const allDates = [];
    const cursor = new Date(fromDate);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= toDate) {
        allDates.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    const result = employees.map((employee) => {
        const empId = employee._id.toString();
        const joiningDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
        if (joiningDate) joiningDate.setHours(0, 0, 0, 0);

        const summary = {
            present: 0, absent: 0, halfDay: 0, shortLeave: 0,
            weekOff: 0, holiday: 0, onLeave: 0, notJoined: 0
        };

        const attendance = allDates.map((dateKey) => {
            const record = attendanceMap?.[empId]?.[dateKey];
            let status, coreStatus;

            if (record) {
                coreStatus = record.coreAttendanceStatus || record.attendanceStatus || record.status || "ABSENT";
                status = coreStatus;
            } else {
                const reportDate = new Date(dateKey);
                reportDate.setHours(0, 0, 0, 0);

                if (joiningDate && reportDate < joiningDate) {
                    status = "NOT_JOINED";
                } else if (isWeekOff(reportDate)) {
                    status = "WEEK_OFF";
                } else {
                    status = "ABSENT";
                }
                coreStatus = status;
            }

            const normalized = status ? status.toUpperCase().trim() : "ABSENT";

            if (normalized.includes("PRESENT")) {
                summary.present++;
            } else if (normalized === "ABSENT") {
                summary.absent++;
            } else if (normalized === "HALF_DAY" || normalized === "HALFDAY") {
                summary.halfDay++;
            } else if (normalized === "SHORT_LEAVE" || normalized === "SHORTLEAVE") {
                summary.shortLeave++;
            } else if (normalized === "WEEK_OFF") {
                summary.weekOff++;
            } else if (normalized === "HOLIDAY") {
                summary.holiday++;
            } else if (normalized === "ON_LEAVE") {
                summary.onLeave++;
            } else if (normalized === "NOT_JOINED") {
                summary.notJoined++;
            } else {
                summary.absent++;
            }

            return {
                date: dateKey,
                attendanceStatus: normalized,
                coreAttendanceStatus: coreStatus,
                firstPunchIn: record?.firstPunchIn || null,
                lastPunchOut: record?.lastPunchOut || null,
                totalWorkingMinutes: record?.totalWorkingMinutes || 0,
                totalBreakMinutes: record?.totalBreakMinutes || 0,
                breakCount: record?.breakCount || 0,
                isLate: record?.isLate || record?.coreIsLate || false,
                lateMinutes: record?.lateMinutes || record?.coreLateMinutes || 0,
                isHalfDay: record?.isHalfDay || record?.coreIsHalfDay || false,
                halfDayType: record?.halfDayType || record?.coreHalfDayType || null,
                remarks: record?.remarks || null
            };
        });

        return {
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
        };
    });

    return {
        fromDate: toDateKey(fromDate),
        toDate: toDateKey(toDate),
        totalEmployees,
        employees: result,
        page,
        limit
    };
};

// ====================================================================
// SUMMARY VERSION
// ====================================================================

const getMonthlyAttendanceSummary = async ({ month, departmentId }) => {
    const { fromDate, toDate } = resolveMonthRange(month);

    const employeeQuery = { isActive: true };
    if (departmentId) {
        employeeQuery.department = departmentId;
    }

    const employees = await Employee.find(employeeQuery)
        .select("_id department")
        .lean();

    if (!employees.length) {
        return {
            fromDate: toDateKey(fromDate),
            toDate: toDateKey(toDate),
            totalEmployees: 0,
            summary: {
                present: 0,
                absent: 0,
                halfDay: 0,
                onLeave: 0,
                weekOff: 0,
                notJoined: 0
            }
        };
    }

    const employeeIds = employees.map(e => e._id);

    // Use simple aggregation for summary
    const attendanceSummary = await Attendance.aggregate([
        {
            $match: {
                employee: { $in: employeeIds },
                date: { $gte: fromDate, $lte: toDate }
            }
        },
        {
            $group: {
                _id: null,
                present: {
                    $sum: { 
                        $cond: [
                            { $or: [
                                { $eq: ['$attendanceStatus', 'PRESENT'] },
                                { $eq: ['$coreAttendanceStatus', 'PRESENT'] }
                            ]}, 
                            1, 0
                        ]
                    }
                },
                absent: {
                    $sum: { 
                        $cond: [
                            { $or: [
                                { $eq: ['$attendanceStatus', 'ABSENT'] },
                                { $eq: ['$coreAttendanceStatus', 'ABSENT'] }
                            ]}, 
                            1, 0
                        ]
                    }
                },
                halfDay: {
                    $sum: { 
                        $cond: [
                            { $or: [
                                { $eq: ['$attendanceStatus', 'HALF_DAY'] },
                                { $eq: ['$coreAttendanceStatus', 'HALF_DAY'] }
                            ]}, 
                            1, 0
                        ]
                    }
                },
                onLeave: {
                    $sum: { 
                        $cond: [
                            { $or: [
                                { $eq: ['$attendanceStatus', 'ON_LEAVE'] },
                                { $eq: ['$coreAttendanceStatus', 'ON_LEAVE'] }
                            ]}, 
                            1, 0
                        ]
                    }
                },
                weekOff: {
                    $sum: { 
                        $cond: [
                            { $or: [
                                { $eq: ['$attendanceStatus', 'WEEK_OFF'] },
                                { $eq: ['$coreAttendanceStatus', 'WEEK_OFF'] }
                            ]}, 
                            1, 0
                        ]
                    }
                }
            }
        }
    ])
    .maxTimeMS(10000);

    const summary = attendanceSummary[0] || {
        present: 0,
        absent: 0,
        halfDay: 0,
        onLeave: 0,
        weekOff: 0
    };

    return {
        fromDate: toDateKey(fromDate),
        toDate: toDateKey(toDate),
        totalEmployees: employees.length,
        summary
    };
};

// ====================================================================
// CACHE MANAGEMENT
// ====================================================================

const clearCache = (pattern = null) => {
    if (pattern) {
        const keys = cache.keys();
        const matchingKeys = keys.filter(key => key.includes(pattern));
        matchingKeys.forEach(key => cache.del(key));
        console.log(`[Cache] Cleared ${matchingKeys.length} keys matching pattern: ${pattern}`);
    } else {
        cache.flushAll();
        console.log('[Cache] Cleared all cache entries');
    }
};

// ====================================================================
// EXPORTS
// ====================================================================

module.exports = {
    getMonthlyAttendance,
    getMonthlyAttendancePaginated,
    getMonthlyAttendanceSummary,
    clearCache,
    cache
};