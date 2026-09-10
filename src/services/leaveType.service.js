// const httpStatus = require("http-status");
// const { ObjectId } = require('mongodb')
// const moment = require("moment");
// const ApiError = require("../utils/ApiError");
// const { LeaveType, LeaveBalance } = require('../models/index');

// const createLeaveType = async (leaveTypeData) => {
//     try {
//         return await LeaveType.create(leaveTypeData)
//     } catch (error) {
//         throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
//     }
// }

// const getLeaveTypes = async (filterQuery) => {
//     try {
//         return await LeaveType.find(filterQuery)
//     } catch (error) {
//         throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
//     }
// }

// const generateLeaveMonths = (joiningDate) => {
//     const months = [];
//     let month = joiningDate.getUTCMonth() + 1;
//     let year = joiningDate.getUTCFullYear();
//     const endYear = month >= 4 ? year + 1 : year;

//     while (true) {
//         months.push({ month, year });
//         if (month === 3 && year === endYear) break;
//         month++;
//         if (month > 12) {
//             month = 1;
//             year++;
//         }
//     }
//     return months;
// };

// const toUTCDateOnly = (date) => {
//     const d = new Date(date);
//     return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
// };

// const isSecondOrFourthSaturday = (date) => {
//     if (date.getUTCDay() !== 6) return false;
//     const week = Math.ceil(date.getUTCDate() / 7);
//     return week === 2 || week === 4;
// };

// const isWorkingDay = (date) => {
//     if (date.getUTCDay() === 0) return false;
//     if (isSecondOrFourthSaturday(date)) return false;
//     return true;
// };

// /**
//  * Returns the list of working-day calendar dates (day-of-month numbers)
//  * from joiningDate till yesterday (UTC-safe).
//  * e.g. joined 6th, today 17th -> [6,8,9,10,13,14,15,16] (Sun 12th & 2nd Sat 11th skipped)
//  */
// const getWorkingDaysList = (joiningDate) => {

//     const start = toUTCDateOnly(joiningDate);
//     const today = toUTCDateOnly(new Date());

//     // Joined today or in future -> nothing deducted
//     if (start.getTime() >= today.getTime()) {
//         return [];
//     }

//     const yesterday = new Date(today);
//     yesterday.setUTCDate(yesterday.getUTCDate() - 1);

//     const days = [];
//     const current = new Date(start);

//     while (current.getTime() <= yesterday.getTime()) {
//         if (isWorkingDay(current)) {
//             days.push(current.getUTCDate()); // day-of-month number
//         }
//         current.setUTCDate(current.getUTCDate() + 1);
//     }

//     return days;
// };

// /**
//  * Create Monthly Leave Balances
//  * @param {*} employeeId
//  * @param {*} joiningDate
//  * @param {*} session - optional mongoose session, passed from createEmployee's transaction
//  */
// const createMonthlyLeaveBalances = async (employeeId, joiningDate, session = null) => {

//     joiningDate = toUTCDateOnly(joiningDate);

//     const leaveTypes = await LeaveType.find({ isActive: true }).session(session);
//     const months = generateLeaveMonths(joiningDate);
//     const records = [];
//     const today = toUTCDateOnly(new Date());

//     const joiningMonth = joiningDate.getUTCMonth() + 1;
//     const joiningYear = joiningDate.getUTCFullYear();
//     const currentMonth = today.getUTCMonth() + 1;
//     const currentYear = today.getUTCFullYear();

//     const workingDaysList = getWorkingDaysList(joiningDate);
//     const workingDaysPassed = workingDaysList.length;

//     console.log("Joining Date :", joiningDate.toISOString());
//     console.log("Today :", today.toISOString());
//     console.log("Working Days Passed :", workingDaysPassed);
//     console.log("Working Days List :", workingDaysList);

//     for (const leaveType of leaveTypes) {
//         for (const { month, year } of months) {

//             let allocated = 0;
//             let used = 0;
//             let remaining = 0;
//             let lop = 0;
//             let deductedDays = [];

//             if (leaveType.code === "EL") {
//                 allocated = (month === 3 || month === 9) ? 3.5 : 2.5;
//                 remaining = allocated;

//                 if (
//                     month === joiningMonth &&
//                     year === joiningYear &&
//                     month === currentMonth &&
//                     year === currentYear
//                 ) {
//                     // Every working day since joining is a deducted day —
//                     // whether it lands inside the EL quota or overflows to LOP.
//                     deductedDays = [...workingDaysList];

//                     if (workingDaysPassed <= allocated) {
//                         used = workingDaysPassed;
//                         remaining = allocated - workingDaysPassed;
//                         lop = 0;
//                     } else {
//                         used = allocated;
//                         remaining = 0;
//                         lop = workingDaysPassed - allocated;
//                     }
//                 }
//             }
//             else if (leaveType.code === "SL") {
//                 allocated = 2;
//                 used = 0;
//                 remaining = allocated;
//                 lop = 0;
//             }
//             else {
//                 allocated = leaveType.monthlyAllocation || 0;
//                 used = 0;
//                 remaining = allocated;
//                 lop = 0;
//             }

//             records.push({
//                 employeeId,
//                 leaveTypeId: leaveType._id,
//                 year,
//                 month,
//                 allocated,
//                 used,
//                 remaining,
//                 lop,
//                 deductedDays
//             });
//         }
//     }

//     if (records.length) {
//         await LeaveBalance.insertMany(records, { session, ordered: true });
//     }

//     return records;
// };

// module.exports = {
//     createLeaveType,
//     getLeaveTypes,
//     generateLeaveMonths,
//     createMonthlyLeaveBalances
// }


const httpStatus = require("http-status");
const { ObjectId } = require('mongodb')
const moment = require("moment");
const ApiError = require("../utils/ApiError");
const { LeaveType, LeaveBalance } = require('../models/index');

const createLeaveType = async (leaveTypeData) => {
    try {
        return await LeaveType.create(leaveTypeData)
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
    }
}

const getLeaveTypes = async (filterQuery) => {
    try {
        return await LeaveType.find(filterQuery)
    } catch (error) {
        throw new ApiError(httpStatus.status.INTERNAL_SERVER_ERROR, error.message)
    }
}

const generateLeaveMonths = (joiningDate) => {
    const months = [];
    let month = joiningDate.getUTCMonth() + 1;
    let year = joiningDate.getUTCFullYear();
    const endYear = month >= 4 ? year + 1 : year;

    while (true) {
        months.push({ month, year });
        if (month === 3 && year === endYear) break;
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }
    return months;
};

// ============================================================================
// FIXED: was toUTCDateOnly() and extracted the calendar date using raw
// getUTCFullYear()/getUTCMonth()/getUTCDate(). That's wrong whenever a date
// (e.g. joiningDate) is the UTC equivalent of an IST local date — e.g.
// "2026-07-17 00:00 IST" is stored as "2026-07-16T18:30:00.000Z", and raw
// UTC extraction reads that back as the 16th instead of the 17th.
//
// The rest of the app (cronAttendance.service.js: toLocalTime,
// getShiftEndUTC, isEmployeeEmployedOnDate) already normalizes every date
// to IST (+05:30) before comparing. This file didn't, so an employee whose
// joiningDate crossed the UTC/IST day boundary got treated as having joined
// a day earlier than they actually did — e.g. joined "17 July IST" was
// read as "16 July", so their very first (non-existent) working day was
// pre-marked as a deducted leave day in the newly created LeaveBalance,
// even before any cron ran.
//
// Fix: convert to the IST calendar date first, then anchor it to a
// synthetic UTC Date whose UTC Y/M/D fields equal that IST calendar date.
// This keeps every other function in this file (isWorkingDay,
// isSecondOrFourthSaturday, getWorkingDaysList, setUTCDate loops) working
// completely unchanged — they just now operate on IST calendar values
// instead of raw UTC ones.
// ============================================================================
const toISTDateOnly = (date) => {
    const istMoment = moment(date).utcOffset("+05:30");
    return new Date(Date.UTC(istMoment.year(), istMoment.month(), istMoment.date()));
};

const isSecondOrFourthSaturday = (date) => {
    if (date.getUTCDay() !== 6) return false;
    const week = Math.ceil(date.getUTCDate() / 7);
    return week === 2 || week === 4;
};

const isWorkingDay = (date) => {
    if (date.getUTCDay() === 0) return false;
    if (isSecondOrFourthSaturday(date)) return false;
    return true;
};

/**
 * Returns the list of working-day calendar dates (day-of-month numbers)
 * from joiningDate till yesterday (IST-safe).
 * e.g. joined 6th, today 17th -> [6,8,9,10,13,14,15,16] (Sun 12th & 2nd Sat 11th skipped)
 */
const getWorkingDaysList = (joiningDate) => {

    const start = toISTDateOnly(joiningDate);
    const today = toISTDateOnly(new Date());

    // Joined today (IST) or in future -> nothing deducted
    if (start.getTime() >= today.getTime()) {
        return [];
    }

    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const days = [];
    const current = new Date(start);

    while (current.getTime() <= yesterday.getTime()) {
        if (isWorkingDay(current)) {
            days.push(current.getUTCDate()); // day-of-month number
        }
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return days;
};

/**
 * Create Monthly Leave Balances
 * @param {*} employeeId
 * @param {*} joiningDate
 * @param {*} session - optional mongoose session, passed from createEmployee's transaction
 */
const createMonthlyLeaveBalances = async (employeeId, joiningDate, session = null) => {

    joiningDate = toISTDateOnly(joiningDate);

    const leaveTypes = await LeaveType.find({ isActive: true }).session(session);
    const months = generateLeaveMonths(joiningDate);
    const records = [];
    const today = toISTDateOnly(new Date());

    const joiningMonth = joiningDate.getUTCMonth() + 1;
    const joiningYear = joiningDate.getUTCFullYear();
    const currentMonth = today.getUTCMonth() + 1;
    const currentYear = today.getUTCFullYear();

    const workingDaysList = getWorkingDaysList(joiningDate);
    const workingDaysPassed = workingDaysList.length;

    console.log("Joining Date (IST) :", joiningDate.toISOString());
    console.log("Today (IST) :", today.toISOString());
    console.log("Working Days Passed :", workingDaysPassed);
    console.log("Working Days List :", workingDaysList);

    for (const leaveType of leaveTypes) {
        for (const { month, year } of months) {

            let allocated = 0;
            let used = 0;
            let remaining = 0;
            let lop = 0;
            let deductedDays = [];

            if (leaveType.code === "EL") {
                allocated = (month === 3 || month === 9) ? 3.5 : 2.5;
                remaining = allocated;

                if (
                    month === joiningMonth &&
                    year === joiningYear &&
                    month === currentMonth &&
                    year === currentYear
                ) {
                    // Every working day since joining is a deducted day —
                    // whether it lands inside the EL quota or overflows to LOP.
                    deductedDays = [...workingDaysList];

                    if (workingDaysPassed <= allocated) {
                        used = workingDaysPassed;
                        remaining = allocated - workingDaysPassed;
                        lop = 0;
                    } else {
                        used = allocated;
                        remaining = 0;
                        lop = workingDaysPassed - allocated;
                    }
                }
            }
            else if (leaveType.code === "SL") {
                allocated = 2;
                used = 0;
                remaining = allocated;
                lop = 0;
            }
            else {
                allocated = leaveType.monthlyAllocation || 0;
                used = 0;
                remaining = allocated;
                lop = 0;
            }

            records.push({
                employeeId,
                leaveTypeId: leaveType._id,
                year,
                month,
                allocated,
                used,
                remaining,
                lop,
                deductedDays
            });
        }
    }

    if (records.length) {
        await LeaveBalance.insertMany(records, { session, ordered: true });
    }

    return records;
};

module.exports = {
    createLeaveType,
    getLeaveTypes,
    generateLeaveMonths,
    createMonthlyLeaveBalances
}