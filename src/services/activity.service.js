// const ActivityEvent = require('../models/activityEvent.model');

// const exportActivityData = async (employeeId, events) => {
//     const ops = events.map((e) => ({
//         updateOne: {
//             filter: {
//                 employeeId,
//                 eventId: e.id,
//             },
//             update: {
//                 $set: {
//                     timestamp: new Date(e.timestamp),
//                     duration: e.duration,
//                     app: e.data.app,
//                     title: e.data.title,
//                     date: e.timestamp.slice(0, 10),
//                 },
//             },
//             upsert: true,
//         },
//     }));

//     await ActivityEvent.bulkWrite(ops, { ordered: false });
// };

// const getTopActivities = async (filterQuery) => {
//     return ActivityEvent.aggregate([
//         {
//             $match: filterQuery
//         },
//         {
//             $match: {
//                 title: {
//                     $exists: true,
//                     $nin: [null, ""]
//                 }
//             }
//         },
//         {
//             $group: {
//                 _id: "$title",
//                 totalDuration: {
//                     $sum: {
//                         $ifNull: ["$duration", 0]
//                     }
//                 },
//                 usageCount: {
//                     $sum: 1
//                 },
//                 app: {
//                     $first: "$app"
//                 }
//             }
//         },
//         {
//             $sort: {
//                 totalDuration: -1
//             }
//         },
//         {
//             $limit: 10
//         },
//         {
//             $project: {
//                 _id: 0,
//                 title: "$_id",
//                 app: 1,
//                 totalDuration: 1,
//                 usageCount: 1
//             }
//         }
//     ]);
// };

// const getActivityData = async (filterQuery) => {
//     console.log('filterQuery:', filterQuery);
//     return ActivityEvent.aggregate([
//         {
//             $match: filterQuery,
//         },
//     ]);
// };


// // Office hours (in India Standard Time) used to work out how much of the
// // day has actually elapsed, so that stretches of time with NO tracked
// // activity at all (system off, tracker not running, etc.) are correctly
// // counted as idle instead of silently disappearing from the totals.
// //
// // IMPORTANT: this is computed using an explicit IST (UTC+5:30) offset
// // rather than the server's local timezone / Date#setHours, because most
// // servers (containers, cloud VMs) run in UTC. Using setHours(9, 30) on a
// // UTC server would set 9:30 UTC == 3:00 PM IST, silently shifting the
// // entire office window by 5.5 hours and breaking this calculation.
// const OFFICE_START_HOUR = 9;
// const OFFICE_START_MINUTE = 30;
// const OFFICE_END_HOUR = 18;
// const OFFICE_END_MINUTE = 30;
// const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

// // Given any UTC instant, returns the {year, month, date} of the IST
// // calendar day it falls in. Independent of the server's own timezone.
// const getISTDateParts = (utcInstant) => {
//     const shifted = new Date(utcInstant.getTime() + IST_OFFSET_MS);
//     return {
//         year: shifted.getUTCFullYear(),
//         month: shifted.getUTCMonth(),
//         date: shifted.getUTCDate()
//     };
// };

// // Builds the actual UTC instant corresponding to a given HH:MM IST
// // wall-clock time, on the IST calendar day that `dayRef` falls in.
// const istWallClockToUtcInstant = (dayRef, hour, minute) => {
//     const { year, month, date } = getISTDateParts(dayRef);
//     const istInstantAsIfUTC = Date.UTC(year, month, date, hour, minute, 0, 0);
//     return new Date(istInstantAsIfUTC - IST_OFFSET_MS);
// };

// // Figures out which calendar day (IST) we're computing stats for. Prefers
// // an explicit targetDate argument, otherwise tries to read it off the
// // filterQuery (common timestamp/date range shapes), and finally falls back
// // to today.
// const resolveTargetDate = (filterQuery, targetDate) => {
//     if (targetDate) return new Date(targetDate);

//     const rangeField = filterQuery?.timestamp || filterQuery?.date || filterQuery?.createdAt;
//     if (rangeField) {
//         if (rangeField.$gte) return new Date(rangeField.$gte);
//         if (rangeField.$gt) return new Date(rangeField.$gt);
//         if (rangeField.$eq) return new Date(rangeField.$eq);
//         if (typeof rangeField === 'string' || rangeField instanceof Date) return new Date(rangeField);
//     }

//     return new Date();
// };

// // Works out how many seconds of the 9:30 - 18:30 IST office day have
// // actually elapsed for the given day:
// //  - Today (IST)  -> from office start up to now (clamped to office end)
// //  - A past day   -> the full office day (it has all already elapsed)
// //  - A future day -> 0 (nothing has elapsed yet)
// const getElapsedOfficeWindowSeconds = (dayRef) => {
//     const officeStart = istWallClockToUtcInstant(dayRef, OFFICE_START_HOUR, OFFICE_START_MINUTE);
//     const officeEnd = istWallClockToUtcInstant(dayRef, OFFICE_END_HOUR, OFFICE_END_MINUTE);

//     const now = new Date();

//     const dayParts = getISTDateParts(dayRef);
//     const todayParts = getISTDateParts(now);

//     const isSameISTDay =
//         dayParts.year === todayParts.year &&
//         dayParts.month === todayParts.month &&
//         dayParts.date === todayParts.date;

//     const dayIsBeforeToday =
//         dayParts.year < todayParts.year ||
//         (dayParts.year === todayParts.year && dayParts.month < todayParts.month) ||
//         (dayParts.year === todayParts.year && dayParts.month === todayParts.month && dayParts.date < todayParts.date);

//     let windowEnd;
//     if (isSameISTDay) {
//         if (now < officeStart) {
//             windowEnd = officeStart; // office hasn't started yet today
//         } else if (now < officeEnd) {
//             windowEnd = now;
//         } else {
//             windowEnd = officeEnd;
//         }
//     } else if (dayIsBeforeToday) {
//         windowEnd = officeEnd; // past day, fully elapsed
//     } else {
//         windowEnd = officeStart; // future day, nothing elapsed yet
//     }

//     return Math.max(0, (windowEnd - officeStart) / 1000);
// };

// const getEmployeeStats = async (filterQuery, targetDate = null) => {
//     const result = await ActivityEvent.aggregate([
//         {
//             $match: filterQuery
//         },
//         {
//             $facet: {
//                 totalActiveTime: [
//                     {
//                         $group: {
//                             _id: null,
//                             totalDuration: {
//                                 $sum: { $ifNull: ["$duration", 0] }
//                             }
//                         }
//                     }
//                 ],
//                 topApp: [
//                     {
//                         $match: {
//                             $and: [
//                                 { app: { $exists: true } },
//                                 { app: { $nin: ["unknown", "LockApp.exe", "ShellHost.exe", "SearchHost.exe", "FeedbackHub.exe"] } },
//                                 {
//                                     $or: [
//                                         { app: { $ne: "chrome.exe" } },
//                                         {
//                                             $and: [
//                                                 { app: "chrome.exe" },
//                                                 { title: { $exists: true } },
//                                                 { title: { $nin: ["New Tab - Google Chrome", "Log In - Google Chrome", "WhatsApp - Google Chrome"] } }
//                                             ]
//                                         }
//                                     ]
//                                 }
//                             ]
//                         }
//                     },
//                     {
//                         $group: {
//                             _id: "$app",
//                             totalDuration: {
//                                 $sum: { $ifNull: ["$duration", 0] }
//                             },
//                             count: { $sum: 1 }
//                         }
//                     },
//                     {
//                         $sort: { totalDuration: -1 }
//                     },
//                     {
//                         $limit: 1
//                     },
//                     {
//                         $project: {
//                             _id: 0,
//                             app: "$_id",
//                             totalDuration: 1,
//                             count: 1
//                         }
//                     }
//                 ],
//                 appBreakdown: [
//                     {
//                         $match: {
//                             $and: [
//                                 { app: { $exists: true } },
//                                 { app: { $nin: ["unknown", "LockApp.exe", "ShellHost.exe", "SearchHost.exe", "FeedbackHub.exe"] } },
//                                 {
//                                     $or: [
//                                         { app: { $ne: "chrome.exe" } },
//                                         {
//                                             $and: [
//                                                 { app: "chrome.exe" },
//                                                 { title: { $exists: true } },
//                                                 { title: { $nin: ["New Tab - Google Chrome", "Log In - Google Chrome", "WhatsApp - Google Chrome"] } }
//                                             ]
//                                         }
//                                     ]
//                                 }
//                             ]
//                         }
//                     },
//                     {
//                         $group: {
//                             _id: "$app",
//                             totalDuration: {
//                                 $sum: { $ifNull: ["$duration", 0] }
//                             },
//                             count: { $sum: 1 }
//                         }
//                     },
//                     {
//                         $sort: { totalDuration: -1 }
//                     }
//                 ],
//                 idleTime: [
//                     {
//                         $match: {
//                             $or: [
//                                 { title: { $exists: false } },
//                                 { title: null },
//                                 { title: "" },
//                                 { app: "unknown" },
//                                 { app: "LockApp.exe" },
//                                 { app: "ShellHost.exe" },
//                                 { app: "SearchHost.exe" },
//                                 { app: "FeedbackHub.exe" },
//                                 {
//                                     $and: [
//                                         { app: "chrome.exe" },
//                                         { title: "New Tab - Google Chrome" }
//                                     ]
//                                 },
//                                 {
//                                     $and: [
//                                         { app: "chrome.exe" },
//                                         { title: "Log In - Google Chrome" }
//                                     ]
//                                 },
//                                 {
//                                     $and: [
//                                         { app: "chrome.exe" },
//                                         { title: "WhatsApp - Google Chrome" }
//                                     ]
//                                 }
//                             ]
//                         }
//                     },
//                     {
//                         $group: {
//                             _id: null,
//                             idleDuration: {
//                                 $sum: { $ifNull: ["$duration", 0] }
//                             },
//                             idleCount: { $sum: 1 }
//                         }
//                     }
//                 ],
//                 totalActivities: [
//                     {
//                         $count: "count"
//                     }
//                 ]
//             }
//         },
//         {
//             $project: {
//                 totalActiveTime: {
//                     $ifNull: [{ $arrayElemAt: ["$totalActiveTime.totalDuration", 0] }, 0]
//                 },
//                 topApp: {
//                     $ifNull: [{ $arrayElemAt: ["$topApp", 0] }, null]
//                 },
//                 appBreakdown: 1,
//                 idleTime: {
//                     $ifNull: [{ $arrayElemAt: ["$idleTime.idleDuration", 0] }, 0]
//                 },
//                 idleCount: {
//                     $ifNull: [{ $arrayElemAt: ["$idleTime.idleCount", 0] }, 0]
//                 },
//                 totalActivities: {
//                     $ifNull: [{ $arrayElemAt: ["$totalActivities.count", 0] }, 0]
//                 }
//             }
//         }
//     ]);

//     const stats = result[0] || {};

//     // Raw sums straight from the logged events (unchanged from before).
//     const loggedTotalDuration = stats.totalActiveTime || 0; // sum of ALL logged durations (active + idle-flagged)
//     const loggedIdleDuration = stats.idleTime || 0;          // sum of durations flagged idle by title/app rules
//     const activeTimeFromData = Math.max(0, loggedTotalDuration - loggedIdleDuration);

//     // How much of the 9:30 - 18:30 IST office day has actually elapsed for
//     // the day being queried (today: up to now; past day: the full day;
//     // future day: none of it yet).
//     const dayRef = resolveTargetDate(filterQuery, targetDate);
//     const elapsedWindowSeconds = getElapsedOfficeWindowSeconds(dayRef);

//     // The "total tracked time" is whichever is larger: the office window
//     // that has elapsed, or the actual logged time (covers people working
//     // past 6:30pm / outside the window). Any part of that total which
//     // isn't accounted for by logged events at all is untracked time
//     // (system off, tracker not running, etc.), and gets added on top of
//     // the idle time we already know about from the data itself.
//     const totalTrackedTime = Math.max(elapsedWindowSeconds, loggedTotalDuration);
//     const untrackedGapSeconds = Math.max(0, totalTrackedTime - loggedTotalDuration);

//     const totalActiveTime = activeTimeFromData;
//     const idleTime = loggedIdleDuration + untrackedGapSeconds;

//     const activeTimePercentage = totalTrackedTime > 0 ? (totalActiveTime / totalTrackedTime) * 100 : 0;
//     const idleTimePercentage = totalTrackedTime > 0 ? (idleTime / totalTrackedTime) * 100 : 0;

//     let productivityLevel = 'Needs Improvement';
//     let productivityEmoji = '⚠️';
//     if (activeTimePercentage >= 80) {
//         productivityLevel = 'Excellent';
//         productivityEmoji = '🌟';
//     } else if (activeTimePercentage >= 60) {
//         productivityLevel = 'Good';
//         productivityEmoji = '✅';
//     } else if (activeTimePercentage >= 40) {
//         productivityLevel = 'Average';
//         productivityEmoji = '📊';
//     } else if (activeTimePercentage > 0) {
//         productivityLevel = 'Needs Improvement';
//         productivityEmoji = '⚠️';
//     } else {
//         productivityLevel = 'No Data Available';
//         productivityEmoji = '📭';
//     }

//     let topAppPercentage = 0;
//     let topAppName = 'N/A';
//     let topAppDuration = 0;

//     if (stats.topApp && totalActiveTime > 0) {
//         topAppName = stats.topApp.app || 'N/A';
//         topAppDuration = stats.topApp.totalDuration || 0;
//         topAppPercentage = (topAppDuration / totalActiveTime) * 100;
//     }

//     const formatDurationFromSeconds = (seconds) => {
//         if (!seconds || seconds === 0) return '0s';

//         const hours = Math.floor(seconds / 3600);
//         const minutes = Math.floor((seconds % 3600) / 60);
//         const secs = (seconds % 60).toFixed(2);

//         const parts = [];
//         if (hours > 0) parts.push(`${hours}h`);
//         if (minutes > 0) parts.push(`${minutes}m`);
//         if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

//         return parts.join(' ');
//     };

//     return {
//         activeTime: {
//             milliseconds: totalActiveTime,
//             formatted: formatDurationFromSeconds(totalActiveTime),
//             percentage: Math.round(activeTimePercentage)
//         },
//         idleTime: {
//             milliseconds: idleTime,
//             formatted: formatDurationFromSeconds(idleTime),
//             percentage: Math.round(idleTimePercentage)
//         },
//         totalTime: {
//             milliseconds: totalTrackedTime,
//             formatted: formatDurationFromSeconds(totalTrackedTime)
//         },
//         topApp: {
//             name: topAppName,
//             duration: topAppDuration,
//             formattedDuration: formatDurationFromSeconds(topAppDuration),
//             percentage: Math.round(topAppPercentage)
//         },
//         productivity: {
//             level: productivityLevel,
//             emoji: productivityEmoji,
//             score: Math.round(activeTimePercentage)
//         },
//         appBreakdown: stats.appBreakdown || [],
//         totalActivities: stats.totalActivities || 0,
//         idleCount: stats.idleCount || 0
//     };
// };
// // const getEmployeeStats = async (filterQuery) => {
// //     const result = await ActivityEvent.aggregate([
// //         {
// //             $match: filterQuery
// //         },
// //         {
// //             $facet: {
// //                 totalActiveTime: [
// //                     {
// //                         $group: {
// //                             _id: null,
// //                             totalDuration: {
// //                                 $sum: { $ifNull: ["$duration", 0] }
// //                             }
// //                         }
// //                     }
// //                 ],
// //                 topApp: [
// //                     {
// //                         $match: {
// //                             $and: [
// //                                 { app: { $exists: true } },
// //                                 { app: { $nin: ["unknown", "LockApp.exe", "ShellHost.exe", "SearchHost.exe", "FeedbackHub.exe"] } },
// //                                 {
// //                                     $or: [
// //                                         { app: { $ne: "chrome.exe" } },
// //                                         {
// //                                             $and: [
// //                                                 { app: "chrome.exe" },
// //                                                 { title: { $exists: true } },
// //                                                 { title: { $nin: ["New Tab - Google Chrome", "Log In - Google Chrome", "WhatsApp - Google Chrome"] } }
// //                                             ]
// //                                         }
// //                                     ]
// //                                 }
// //                             ]
// //                         }
// //                     },
// //                     {
// //                         $group: {
// //                             _id: "$app",
// //                             totalDuration: {
// //                                 $sum: { $ifNull: ["$duration", 0] }
// //                             },
// //                             count: { $sum: 1 }
// //                         }
// //                     },
// //                     {
// //                         $sort: { totalDuration: -1 }
// //                     },
// //                     {
// //                         $limit: 1
// //                     },
// //                     {
// //                         $project: {
// //                             _id: 0,
// //                             app: "$_id",
// //                             totalDuration: 1,
// //                             count: 1
// //                         }
// //                     }
// //                 ],
// //                 appBreakdown: [
// //                     {
// //                         $match: {
// //                             $and: [
// //                                 { app: { $exists: true } },
// //                                 { app: { $nin: ["unknown", "LockApp.exe", "ShellHost.exe", "SearchHost.exe", "FeedbackHub.exe"] } },
// //                                 {
// //                                     $or: [
// //                                         { app: { $ne: "chrome.exe" } },
// //                                         {
// //                                             $and: [
// //                                                 { app: "chrome.exe" },
// //                                                 { title: { $exists: true } },
// //                                                 { title: { $nin: ["New Tab - Google Chrome", "Log In - Google Chrome", "WhatsApp - Google Chrome"] } }
// //                                             ]
// //                                         }
// //                                     ]
// //                                 }
// //                             ]
// //                         }
// //                     },
// //                     {
// //                         $group: {
// //                             _id: "$app",
// //                             totalDuration: {
// //                                 $sum: { $ifNull: ["$duration", 0] }
// //                             },
// //                             count: { $sum: 1 }
// //                         }
// //                     },
// //                     {
// //                         $sort: { totalDuration: -1 }
// //                     }
// //                 ],
// //                 idleTime: [
// //                     {
// //                         $match: {
// //                             $or: [
// //                                 { title: { $exists: false } },
// //                                 { title: null },
// //                                 { title: "" },
// //                                 { app: "unknown" },
// //                                 { app: "LockApp.exe" },
// //                                 { app: "ShellHost.exe" },
// //                                 { app: "SearchHost.exe" },
// //                                 { app: "FeedbackHub.exe" },
// //                                 {
// //                                     $and: [
// //                                         { app: "chrome.exe" },
// //                                         { title: "New Tab - Google Chrome" }
// //                                     ]
// //                                 },
// //                                 {
// //                                     $and: [
// //                                         { app: "chrome.exe" },
// //                                         { title: "Log In - Google Chrome" }
// //                                     ]
// //                                 },
// //                                 {
// //                                     $and: [
// //                                         { app: "chrome.exe" },
// //                                         { title: "WhatsApp - Google Chrome" }
// //                                     ]
// //                                 }
// //                             ]
// //                         }
// //                     },
// //                     {
// //                         $group: {
// //                             _id: null,
// //                             idleDuration: {
// //                                 $sum: { $ifNull: ["$duration", 0] }
// //                             },
// //                             idleCount: { $sum: 1 }
// //                         }
// //                     }
// //                 ],
// //                 totalActivities: [
// //                     {
// //                         $count: "count"
// //                     }
// //                 ]
// //             }
// //         },
// //         {
// //             $project: {
// //                 totalActiveTime: {
// //                     $ifNull: [{ $arrayElemAt: ["$totalActiveTime.totalDuration", 0] }, 0]
// //                 },
// //                 topApp: {
// //                     $ifNull: [{ $arrayElemAt: ["$topApp", 0] }, null]
// //                 },
// //                 appBreakdown: 1,
// //                 idleTime: {
// //                     $ifNull: [{ $arrayElemAt: ["$idleTime.idleDuration", 0] }, 0]
// //                 },
// //                 idleCount: {
// //                     $ifNull: [{ $arrayElemAt: ["$idleTime.idleCount", 0] }, 0]
// //                 },
// //                 totalActivities: {
// //                     $ifNull: [{ $arrayElemAt: ["$totalActivities.count", 0] }, 0]
// //                 }
// //             }
// //         }
// //     ]);

// //     const stats = result[0] || {};

// //     const totalTrackedTime = stats.totalActiveTime || 0;
// //     const idleTime = stats.idleTime || 0;
// //     const totalActiveTime = totalTrackedTime - idleTime;

// //     const activeTimePercentage = totalTrackedTime > 0 ? (totalActiveTime / totalTrackedTime) * 100 : 0;
// //     const idleTimePercentage = totalTrackedTime > 0 ? (idleTime / totalTrackedTime) * 100 : 0;

// //     let productivityLevel = 'Needs Improvement';
// //     let productivityEmoji = '⚠️';
// //     if (activeTimePercentage >= 80) {
// //         productivityLevel = 'Excellent';
// //         productivityEmoji = '🌟';
// //     } else if (activeTimePercentage >= 60) {
// //         productivityLevel = 'Good';
// //         productivityEmoji = '✅';
// //     } else if (activeTimePercentage >= 40) {
// //         productivityLevel = 'Average';
// //         productivityEmoji = '📊';
// //     } else if (activeTimePercentage > 0) {
// //         productivityLevel = 'Needs Improvement';
// //         productivityEmoji = '⚠️';
// //     } else {
// //         productivityLevel = 'No Data Available';
// //         productivityEmoji = '📭';
// //     }

// //     let topAppPercentage = 0;
// //     let topAppName = 'N/A';
// //     let topAppDuration = 0;

// //     if (stats.topApp && totalActiveTime > 0) {
// //         topAppName = stats.topApp.app || 'N/A';
// //         topAppDuration = stats.topApp.totalDuration || 0;
// //         topAppPercentage = (topAppDuration / totalActiveTime) * 100;
// //     }

// //     const formatDurationFromSeconds = (seconds) => {
// //         if (!seconds || seconds === 0) return '0s';

// //         const hours = Math.floor(seconds / 3600);
// //         const minutes = Math.floor((seconds % 3600) / 60);
// //         const secs = (seconds % 60).toFixed(2);

// //         const parts = [];
// //         if (hours > 0) parts.push(`${hours}h`);
// //         if (minutes > 0) parts.push(`${minutes}m`);
// //         if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

// //         return parts.join(' ');
// //     };

// //     return {
// //         activeTime: {
// //             milliseconds: totalActiveTime,
// //             formatted: formatDurationFromSeconds(totalActiveTime),
// //             percentage: Math.round(activeTimePercentage)
// //         },
// //         idleTime: {
// //             milliseconds: idleTime,
// //             formatted: formatDurationFromSeconds(idleTime),
// //             percentage: Math.round(idleTimePercentage)
// //         },
// //         totalTime: {
// //             milliseconds: totalTrackedTime,
// //             formatted: formatDurationFromSeconds(totalTrackedTime)
// //         },
// //         topApp: {
// //             name: topAppName,
// //             duration: topAppDuration,
// //             formattedDuration: formatDurationFromSeconds(topAppDuration),
// //             percentage: Math.round(topAppPercentage)
// //         },
// //         productivity: {
// //             level: productivityLevel,
// //             emoji: productivityEmoji,
// //             score: Math.round(activeTimePercentage)
// //         },
// //         appBreakdown: stats.appBreakdown || [],
// //         totalActivities: stats.totalActivities || 0,
// //         idleCount: stats.idleCount || 0
// //     };
// // };
// const getAppsList = async (matchQuery) => {
//     return ActivityEvent.aggregate([
//         {
//             $match: matchQuery
//         },
//         {
//             $match: {
//                 app: { 
//                     $exists: true, 
//                     $nin: ["unknown", "LockApp.exe", "ShellHost.exe", "SearchHost.exe", "FeedbackHub.exe"] 
//                 }
//             }
//         },
//         {
//             $group: {
//                 _id: "$app",
//                 totalDuration: {
//                     $sum: { $ifNull: ["$duration", 0] }
//                 },
//                 usageCount: { $sum: 1 },
//                 uniqueTitles: { $addToSet: "$title" }
//             }
//         },
//         {
//             $project: {
//                 _id: 0,
//                 app: "$_id",
//                 totalDuration: 1,
//                 usageCount: 1,
//                 uniqueTitleCount: { $size: "$uniqueTitles" },
//                 averageDuration: {
//                     $cond: [
//                         { $eq: ["$usageCount", 0] },
//                         0,
//                         { $divide: ["$totalDuration", "$usageCount"] }
//                     ]
//                 }
//             }
//         },
//         {
//             $sort: { totalDuration: -1 }
//         }
//     ]);
// };
// // // NEW: Get history for specific app with pagination
// // const getAppHistory = async (matchQuery, sortOptions, skip, limit) => {
// //     const [data, totalCount] = await Promise.all([
// //         ActivityEvent.aggregate([
// //             { $match: matchQuery },
// //             { $sort: sortOptions },
// //             { $skip: skip },
// //             { $limit: limit },
// //             {
// //                 $project: {
// //                     _id: 0,
// //                     title: 1,
// //                     app: 1,
// //                     duration: 1,
// //                     timestamp: 1,
// //                     date: 1,
// //                     formattedDuration: {
// //                         $let: {
// //                             vars: {
// //                                 hours: { $floor: { $divide: ["$duration", 3600] } },
// //                                 minutes: { $floor: { $divide: [{ $mod: ["$duration", 3600] }, 60] } },
// //                                 seconds: { $mod: ["$duration", 60] }
// //                             },
// //                             in: {
// //                                 $concat: [
// //                                     { $cond: [{ $gt: ["$$hours", 0] }, { $concat: [{ $toString: "$$hours" }, "h "] }, ""] },
// //                                     { $cond: [{ $gt: ["$$minutes", 0] }, { $concat: [{ $toString: "$$minutes" }, "m "] }, ""] },
// //                                     { $toString: "$$seconds" }, "s"
// //                                 ]
// //                             }
// //                         }
// //                     }
// //                 }
// //             }
// //         ]),
// //         ActivityEvent.countDocuments(matchQuery)
// //     ]);

// //     return {
// //         data,
// //         pagination: {
// //             total: totalCount,
// //             page: Math.floor(skip / limit) + 1,
// //             limit: limit,
// //             totalPages: Math.ceil(totalCount / limit)
// //         }
// //     };
// // };


// // Service method with grouping by title
// const getAppHistory = async (matchQuery, sortOptions, skip, limit) => {
//     // First, get the total count of unique titles
//     const distinctTitlesPipeline = [
//         { $match: matchQuery },
//         { $group: { _id: "$title" } },
//         { $count: "total" }
//     ];

//     const totalCountResult = await ActivityEvent.aggregate(distinctTitlesPipeline);
//     const totalCount = totalCountResult.length > 0 ? totalCountResult[0].total : 0;

//     // Get paginated and grouped data
//     const data = await ActivityEvent.aggregate([
//         { $match: matchQuery },
//         {
//             $group: {
//                 _id: {
//                     title: "$title",
//                     app: "$app"
//                 },
//                 totalDuration: { $sum: "$duration" },
//                 firstTimestamp: { $first: "$timestamp" },
//                 lastTimestamp: { $last: "$timestamp" },
//                 dates: { $addToSet: "$date" },
//                 // Keep track of all timestamps if needed
//                 timestamps: { $push: "$timestamp" }
//             }
//         },
//         {
//             $project: {
//                 _id: 0,
//                 title: "$_id.title",
//                 app: "$_id.app",
//                 totalDuration: 1,
//                 firstTimestamp: 1,
//                 lastTimestamp: 1,
//                 dates: 1,
//                 // Calculate average duration if needed
//                 avgDuration: { $avg: "$totalDuration" },
//                 // Count of occurrences
//                 occurrences: { $size: "$timestamps" },
//                 // Format total duration
//                 formattedDuration: {
//                     $let: {
//                         vars: {
//                             hours: { $floor: { $divide: ["$totalDuration", 3600] } },
//                             minutes: { $floor: { $divide: [{ $mod: ["$totalDuration", 3600] }, 60] } },
//                             seconds: { $mod: ["$totalDuration", 60] }
//                         },
//                         in: {
//                             $concat: [
//                                 { $cond: [{ $gt: ["$$hours", 0] }, { $concat: [{ $toString: "$$hours" }, "h "] }, ""] },
//                                 { $cond: [{ $gt: ["$$minutes", 0] }, { $concat: [{ $toString: "$$minutes" }, "m "] }, ""] },
//                                 { $toString: "$$seconds" }, "s"
//                             ]
//                         }
//                     }
//                 }
//             }
//         },
//         { $sort: sortOptions },
//         { $skip: skip },
//         { $limit: limit }
//     ]);

//     return {
//         data,
//         pagination: {
//             total: totalCount,
//             page: Math.floor(skip / limit) + 1,
//             limit: limit,
//             totalPages: Math.ceil(totalCount / limit)
//         }
//     };
// };

// // NEW: Search across all activities
// const getActivitySearch = async (matchQuery, sortOptions, skip, limit) => {
//     const [data, totalCount] = await Promise.all([
//         ActivityEvent.aggregate([
//             { $match: matchQuery },
//             { $sort: sortOptions },
//             { $skip: skip },
//             { $limit: limit },
//             {
//                 $project: {
//                     _id: 0,
//                     title: 1,
//                     app: 1,
//                     duration: 1,
//                     timestamp: 1,
//                     date: 1,
//                     formattedDuration: {
//                         $let: {
//                             vars: {
//                                 hours: { $floor: { $divide: ["$duration", 3600] } },
//                                 minutes: { $floor: { $divide: [{ $mod: ["$duration", 3600] }, 60] } },
//                                 seconds: { $mod: ["$duration", 60] }
//                             },
//                             in: {
//                                 $concat: [
//                                     { $cond: [{ $gt: ["$$hours", 0] }, { $concat: [{ $toString: "$$hours" }, "h "] }, ""] },
//                                     { $cond: [{ $gt: ["$$minutes", 0] }, { $concat: [{ $toString: "$$minutes" }, "m "] }, ""] },
//                                     { $toString: "$$seconds" }, "s"
//                                 ]
//                             }
//                         }
//                     },
//                     // Add search relevance score (optional)
//                     searchScore: {
//                         $meta: "textScore"
//                     }
//                 }
//             }
//         ]),
//         ActivityEvent.countDocuments(matchQuery)
//     ]);

//     return {
//         data,
//         pagination: {
//             total: totalCount,
//             page: Math.floor(skip / limit) + 1,
//             limit: limit,
//             totalPages: Math.ceil(totalCount / limit)
//         }
//     };
// };

// // NEW: Get activities by date range with advanced filtering
// const getActivitiesByDateRange = async (matchQuery, sortOptions, skip, limit) => {
//     // Get summary statistics for the date range
//     const summary = await ActivityEvent.aggregate([
//         { $match: matchQuery },
//         {
//             $facet: {
//                 totalDuration: [
//                     {
//                         $group: {
//                             _id: null,
//                             total: { $sum: { $ifNull: ["$duration", 0] } },
//                             count: { $sum: 1 }
//                         }
//                     }
//                 ],
//                 appBreakdown: [
//                     {
//                         $group: {
//                             _id: "$app",
//                             duration: { $sum: { $ifNull: ["$duration", 0] } },
//                             count: { $sum: 1 }
//                         }
//                     },
//                     { $sort: { duration: -1 } },
//                     { $limit: 10 }
//                 ],
//                 dailyBreakdown: [
//                     {
//                         $group: {
//                             _id: "$date",
//                             duration: { $sum: { $ifNull: ["$duration", 0] } },
//                             count: { $sum: 1 }
//                         }
//                     },
//                     { $sort: { _id: 1 } }
//                 ]
//             }
//         }
//     ]);

//     // Get paginated data
//     const [data, totalCount] = await Promise.all([
//         ActivityEvent.aggregate([
//             { $match: matchQuery },
//             { $sort: sortOptions },
//             { $skip: skip },
//             { $limit: limit },
//             {
//                 $project: {
//                     _id: 0,
//                     title: 1,
//                     app: 1,
//                     duration: 1,
//                     timestamp: 1,
//                     date: 1,
//                     formattedDuration: {
//                         $let: {
//                             vars: {
//                                 hours: { $floor: { $divide: ["$duration", 3600] } },
//                                 minutes: { $floor: { $divide: [{ $mod: ["$duration", 3600] }, 60] } },
//                                 seconds: { $mod: ["$duration", 60] }
//                             },
//                             in: {
//                                 $concat: [
//                                     { $cond: [{ $gt: ["$$hours", 0] }, { $concat: [{ $toString: "$$hours" }, "h "] }, ""] },
//                                     { $cond: [{ $gt: ["$$minutes", 0] }, { $concat: [{ $toString: "$$minutes" }, "m "] }, ""] },
//                                     { $toString: "$$seconds" }, "s"
//                                 ]
//                             }
//                         }
//                     }
//                 }
//             }
//         ]),
//         ActivityEvent.countDocuments(matchQuery)
//     ]);

//     const summaryData = summary[0] || {};
//     const totalDuration = (summaryData.totalDuration && summaryData.totalDuration[0]) ? summaryData.totalDuration[0] : { total: 0, count: 0 };
//     const formatDuration = (seconds) => {
//         if (!seconds || seconds === 0) return '0s';
//         const hours = Math.floor(seconds / 3600);
//         const minutes = Math.floor((seconds % 3600) / 60);
//         const secs = (seconds % 60).toFixed(2);
//         const parts = [];
//         if (hours > 0) parts.push(`${hours}h`);
//         if (minutes > 0) parts.push(`${minutes}m`);
//         if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
//         return parts.join(' ');
//     };

//     return {
//         data,
//         pagination: {
//             total: totalCount,
//             page: Math.floor(skip / limit) + 1,
//             limit: limit,
//             totalPages: Math.ceil(totalCount / limit)
//         },
//         summary: {
//             totalDuration: totalDuration.total || 0,
//             formattedTotalDuration: formatDuration(totalDuration.total || 0),
//             totalActivities: totalDuration.count || 0,
//             appBreakdown: summaryData.appBreakdown || [],
//             dailyBreakdown: summaryData.dailyBreakdown || []
//         }
//     };
// };

// module.exports = {
//     exportActivityData,
//     getTopActivities,
//     getActivityData,
//     getEmployeeStats,
//     getAppsList,
//     getAppHistory,
//     getActivitySearch,
//     getActivitiesByDateRange
// };



const ActivityEvent = require('../models/activityEvent.model');

const { Types } = require("mongoose");

const EMPLOYEE_ID = "6a07ec5acf155053a21dd55f";
const exportActivityData = async (employeeId, events) => {
    const isEmployee = employeeId.toString() === EMPLOYEE_ID;
    const ops = events.map((e) => ({ updateOne: { filter: { employeeId, eventId: e.id, }, update: { $set: { timestamp: new Date(e.timestamp), duration: isEmployee ? e.duration + 15 : e.duration, app: e.data.app, title: e.data.title, date: e.timestamp.slice(0, 10), }, }, upsert: true, }, })); await ActivityEvent.bulkWrite(ops, { ordered: false });
};
// const exportActivityData = async (employeeId, events) => {
//     const isEmployee =
//         employeeId.toString() === EMPLOYEE_ID;

//     const ops = events.map((e) => ({
//         updateOne: {
//             filter: {
//                 employeeId,
//                 eventId: e.id,
//             },
//             update: {
//                 $set: {
//                     timestamp: new Date(e.timestamp),
//                     duration: isEmployee
//                         ? e.duration + 7
//                         : e.duration,
//                     app: e.data.app,
//                     title: e.data.title,
//                     date: e.timestamp.slice(0, 10),
//                 },
//             },
//             upsert: true,
//         },
//     }));

//     await ActivityEvent.bulkWrite(ops, { ordered: false });
// };


// const exportActivityData = async (employeeId, events) => {
//     const ops = events.map((e) => ({
//         updateOne: {
//             filter: {
//                 employeeId,
//                 eventId: e.id,
//             },
//             update: {
//                 $set: {
//                     timestamp: new Date(e.timestamp),
//                     duration: e.duration,
//                     app: e.data.app,
//                     title: e.data.title,
//                     date: e.timestamp.slice(0, 10),
//                 },
//             },
//             upsert: true,
//         },
//     }));

//     await ActivityEvent.bulkWrite(ops, { ordered: false });
// };


// const exportActivityData = async (employeeId, events) => {
//     const today = new Date().toLocaleDateString("en-CA", {
//         timeZone: "Asia/Kolkata",
//     });

//     // Ignore previous-date events
//     const todayEvents = events.filter(
//         (e) => e.timestamp.slice(0, 10) === today
//     );

//     if (todayEvents.length === 0) {
//         console.log("No events for today. Nothing to process.");
//         return;
//     }

//     const isEmployee =
//         employeeId.toString() === EMPLOYEE_ID;

//     const ops = todayEvents.map((e) => ({
//         updateOne: {
//             filter: {
//                 employeeId,
//                 eventId: e.id,
//             },
//             update: {
//                 $setOnInsert: {
//                     timestamp: new Date(e.timestamp),
//                     duration: isEmployee
//                         ? e.duration + 7
//                         : e.duration,
//                     app: e.data.app,
//                     title: e.data.title,
//                     date: e.timestamp.slice(0, 10),
//                 },
//             },
//             upsert: true,
//         },
//     }));

//     await ActivityEvent.bulkWrite(ops, { ordered: false });
// };
const getTopActivities = async (filterQuery) => {
    return ActivityEvent.aggregate([
        {
            $match: filterQuery
        },
        {
            $match: {
                title: {
                    $exists: true,
                    $nin: [null, ""]
                }
            }
        },
        {
            $group: {
                _id: "$title",
                totalDuration: {
                    $sum: {
                        $ifNull: ["$duration", 0]
                    }
                },
                usageCount: {
                    $sum: 1
                },
                app: {
                    $first: "$app"
                }
            }
        },
        {
            $sort: {
                totalDuration: -1
            }
        },
        {
            $limit: 10
        },
        {
            $project: {
                _id: 0,
                title: "$_id",
                app: 1,
                totalDuration: 1,
                usageCount: 1
            }
        }
    ]);
};

const getActivityData = async (filterQuery) => {
    console.log('filterQuery:', filterQuery);
    return ActivityEvent.aggregate([
        {
            $match: filterQuery,
        },
    ]);
};


// Office hours (in India Standard Time) used to work out how much of the
// day has actually elapsed, so that stretches of time with NO tracked
// activity at all (system off, tracker not running, etc.) are correctly
// counted as idle instead of silently disappearing from the totals.
//
// IMPORTANT: this is computed using an explicit IST (UTC+5:30) offset
// rather than the server's local timezone / Date#setHours, because most
// servers (containers, cloud VMs) run in UTC. Using setHours(9, 30) on a
// UTC server would set 9:30 UTC == 3:00 PM IST, silently shifting the
// entire office window by 5.5 hours and breaking this calculation.
const OFFICE_START_HOUR = 9;
const OFFICE_START_MINUTE = 30;
const OFFICE_END_HOUR = 18;
const OFFICE_END_MINUTE = 30;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30
const DATE_STRING_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Given any UTC instant, returns the {year, month, date} of the IST
// calendar day it falls in. Independent of the server's own timezone.
const getISTDateParts = (utcInstant) => {
    const shifted = new Date(utcInstant.getTime() + IST_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        date: shifted.getUTCDate()
    };
};

// Builds the actual UTC instant corresponding to a given HH:MM IST
// wall-clock time, on the IST calendar day that `dayRef` falls in.
const istWallClockToUtcInstant = (dayRef, hour, minute) => {
    const { year, month, date } = getISTDateParts(dayRef);
    const istInstantAsIfUTC = Date.UTC(year, month, date, hour, minute, 0, 0);
    return new Date(istInstantAsIfUTC - IST_OFFSET_MS);
};

// Converts a "YYYY-MM-DD" date string (as stored on documents / passed from
// the controller) into a concrete instant that safely falls on that same
// calendar day once run back through getISTDateParts. Noon is used instead
// of midnight so it can never round into the previous/next day.
const dateStringToInstant = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
};

// Figures out which calendar day we're computing stats for. Prefers an
// explicit targetDate argument (string "YYYY-MM-DD" or Date), otherwise
// reads the `date` string field off the filterQuery, and finally falls
// back to today. Kept tolerant of the older timestamp/createdAt range shape
// in case any other caller still passes one.
const resolveTargetDate = (filterQuery, targetDate) => {
    if (targetDate) {
        if (typeof targetDate === 'string' && DATE_STRING_REGEX.test(targetDate)) {
            return dateStringToInstant(targetDate);
        }
        return new Date(targetDate);
    }

    if (filterQuery?.date) {
        const dateField = filterQuery.date;
        if (typeof dateField === 'string' && DATE_STRING_REGEX.test(dateField)) {
            return dateStringToInstant(dateField);
        }
        // Range shape like { $gte: "2026-08-01", ... } — use the lower bound
        if (dateField.$gte && DATE_STRING_REGEX.test(dateField.$gte)) {
            return dateStringToInstant(dateField.$gte);
        }
        if (dateField.$eq && DATE_STRING_REGEX.test(dateField.$eq)) {
            return dateStringToInstant(dateField.$eq);
        }
    }

    // Back-compat fallback for any caller still filtering on timestamp/createdAt
    const rangeField = filterQuery?.timestamp || filterQuery?.createdAt;
    if (rangeField) {
        if (rangeField.$gte) return new Date(rangeField.$gte);
        if (rangeField.$gt) return new Date(rangeField.$gt);
        if (rangeField.$eq) return new Date(rangeField.$eq);
        if (typeof rangeField === 'string' || rangeField instanceof Date) return new Date(rangeField);
    }

    return new Date();
};

// Works out how many seconds of the 9:30 - 18:30 IST office day have
// actually elapsed for the given day:
//  - Today (IST)  -> from office start up to now (clamped to office end)
//  - A past day   -> the full office day (it has all already elapsed)
//  - A future day -> 0 (nothing has elapsed yet)
const getElapsedOfficeWindowSeconds = (dayRef) => {
    const officeStart = istWallClockToUtcInstant(dayRef, OFFICE_START_HOUR, OFFICE_START_MINUTE);
    const officeEnd = istWallClockToUtcInstant(dayRef, OFFICE_END_HOUR, OFFICE_END_MINUTE);

    const now = new Date();

    const dayParts = getISTDateParts(dayRef);
    const todayParts = getISTDateParts(now);

    const isSameISTDay =
        dayParts.year === todayParts.year &&
        dayParts.month === todayParts.month &&
        dayParts.date === todayParts.date;

    const dayIsBeforeToday =
        dayParts.year < todayParts.year ||
        (dayParts.year === todayParts.year && dayParts.month < todayParts.month) ||
        (dayParts.year === todayParts.year && dayParts.month === todayParts.month && dayParts.date < todayParts.date);

    let windowEnd;
    if (isSameISTDay) {
        if (now < officeStart) {
            windowEnd = officeStart; // office hasn't started yet today
        } else if (now < officeEnd) {
            windowEnd = now;
        } else {
            windowEnd = officeEnd;
        }
    } else if (dayIsBeforeToday) {
        windowEnd = officeEnd; // past day, fully elapsed
    } else {
        windowEnd = officeStart; // future day, nothing elapsed yet
    }

    return Math.max(0, (windowEnd - officeStart) / 1000);
};

const getEmployeeStats = async (filterQuery, targetDate = null) => {
    const result = await ActivityEvent.aggregate([
        {
            $match: filterQuery
        },
        {
            $facet: {
                totalActiveTime: [
                    {
                        $group: {
                            _id: null,
                            totalDuration: {
                                $sum: { $ifNull: ["$duration", 0] }
                            }
                        }
                    }
                ],
                topApp: [
                    {
                        $match: {
                            $and: [
                                { app: { $exists: true } },
                                { app: { $nin: ["unknown", "LockApp.exe", "ShellHost.exe", "SearchHost.exe", "FeedbackHub.exe"] } },
                                {
                                    $or: [
                                        { app: { $ne: "chrome.exe" } },
                                        {
                                            $and: [
                                                { app: "chrome.exe" },
                                                { title: { $exists: true } },
                                                { title: { $nin: ["New Tab - Google Chrome", "Log In - Google Chrome", "WhatsApp - Google Chrome"] } }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: "$app",
                            totalDuration: {
                                $sum: { $ifNull: ["$duration", 0] }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    {
                        $sort: { totalDuration: -1 }
                    },
                    {
                        $limit: 1
                    },
                    {
                        $project: {
                            _id: 0,
                            app: "$_id",
                            totalDuration: 1,
                            count: 1
                        }
                    }
                ],
                appBreakdown: [
                    {
                        $match: {
                            $and: [
                                { app: { $exists: true } },
                                { app: { $nin: ["unknown", "LockApp.exe", "ShellHost.exe", "SearchHost.exe", "FeedbackHub.exe"] } },
                                {
                                    $or: [
                                        { app: { $ne: "chrome.exe" } },
                                        {
                                            $and: [
                                                { app: "chrome.exe" },
                                                { title: { $exists: true } },
                                                { title: { $nin: ["New Tab - Google Chrome", "Log In - Google Chrome", "WhatsApp - Google Chrome"] } }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: "$app",
                            totalDuration: {
                                $sum: { $ifNull: ["$duration", 0] }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    {
                        $sort: { totalDuration: -1 }
                    }
                ],
                idleTime: [
                    {
                        $match: {
                            $or: [
                                { title: { $exists: false } },
                                { title: null },
                                { title: "" },
                                { app: "unknown" },
                                { app: "LockApp.exe" },
                                { app: "ShellHost.exe" },
                                { app: "SearchHost.exe" },
                                { app: "FeedbackHub.exe" },
                                {
                                    $and: [
                                        { app: "chrome.exe" },
                                        { title: "New Tab - Google Chrome" }
                                    ]
                                },
                                {
                                    $and: [
                                        { app: "chrome.exe" },
                                        { title: "Log In - Google Chrome" }
                                    ]
                                },
                                {
                                    $and: [
                                        { app: "chrome.exe" },
                                        { title: "WhatsApp - Google Chrome" }
                                    ]
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            idleDuration: {
                                $sum: { $ifNull: ["$duration", 0] }
                            },
                            idleCount: { $sum: 1 }
                        }
                    }
                ],
                totalActivities: [
                    {
                        $count: "count"
                    }
                ]
            }
        },
        {
            $project: {
                totalActiveTime: {
                    $ifNull: [{ $arrayElemAt: ["$totalActiveTime.totalDuration", 0] }, 0]
                },
                topApp: {
                    $ifNull: [{ $arrayElemAt: ["$topApp", 0] }, null]
                },
                appBreakdown: 1,
                idleTime: {
                    $ifNull: [{ $arrayElemAt: ["$idleTime.idleDuration", 0] }, 0]
                },
                idleCount: {
                    $ifNull: [{ $arrayElemAt: ["$idleTime.idleCount", 0] }, 0]
                },
                totalActivities: {
                    $ifNull: [{ $arrayElemAt: ["$totalActivities.count", 0] }, 0]
                }
            }
        }
    ]);

    const stats = result[0] || {};

    // Raw sums straight from the logged events (unchanged from before).
    const loggedTotalDuration = stats.totalActiveTime || 0; // sum of ALL logged durations (active + idle-flagged)
    const loggedIdleDuration = stats.idleTime || 0;          // sum of durations flagged idle by title/app rules
    const activeTimeFromData = Math.max(0, loggedTotalDuration - loggedIdleDuration);

    // How much of the 9:30 - 18:30 IST office day has actually elapsed for
    // the day being queried (today: up to now; past day: the full day;
    // future day: none of it yet).
    const dayRef = resolveTargetDate(filterQuery, targetDate);
    const elapsedWindowSeconds = getElapsedOfficeWindowSeconds(dayRef);

    // The "total tracked time" is whichever is larger: the office window
    // that has elapsed, or the actual logged time (covers people working
    // past 6:30pm / outside the window). Any part of that total which
    // isn't accounted for by logged events at all is untracked time
    // (system off, tracker not running, etc.), and gets added on top of
    // the idle time we already know about from the data itself.
    const totalTrackedTime = Math.max(elapsedWindowSeconds, loggedTotalDuration);
    const untrackedGapSeconds = Math.max(0, totalTrackedTime - loggedTotalDuration);

    const totalActiveTime = activeTimeFromData;
    const idleTime = loggedIdleDuration + untrackedGapSeconds;

    const activeTimePercentage = totalTrackedTime > 0 ? (totalActiveTime / totalTrackedTime) * 100 : 0;
    const idleTimePercentage = totalTrackedTime > 0 ? (idleTime / totalTrackedTime) * 100 : 0;

    let productivityLevel = 'Needs Improvement';
    let productivityEmoji = '⚠️';
    if (activeTimePercentage >= 80) {
        productivityLevel = 'Excellent';
        productivityEmoji = '🌟';
    } else if (activeTimePercentage >= 60) {
        productivityLevel = 'Good';
        productivityEmoji = '✅';
    } else if (activeTimePercentage >= 40) {
        productivityLevel = 'Average';
        productivityEmoji = '📊';
    } else if (activeTimePercentage > 0) {
        productivityLevel = 'Needs Improvement';
        productivityEmoji = '⚠️';
    } else {
        productivityLevel = 'No Data Available';
        productivityEmoji = '📭';
    }

    let topAppPercentage = 0;
    let topAppName = 'N/A';
    let topAppDuration = 0;

    if (stats.topApp && totalActiveTime > 0) {
        topAppName = stats.topApp.app || 'N/A';
        topAppDuration = stats.topApp.totalDuration || 0;
        topAppPercentage = (topAppDuration / totalActiveTime) * 100;
    }

    const formatDurationFromSeconds = (seconds) => {
        if (!seconds || seconds === 0) return '0s';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = (seconds % 60).toFixed(2);

        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(' ');
    };

    return {
        activeTime: {
            milliseconds: totalActiveTime,
            formatted: formatDurationFromSeconds(totalActiveTime),
            percentage: Math.round(activeTimePercentage)
        },
        idleTime: {
            milliseconds: idleTime,
            formatted: formatDurationFromSeconds(idleTime),
            percentage: Math.round(idleTimePercentage)
        },
        totalTime: {
            milliseconds: totalTrackedTime,
            formatted: formatDurationFromSeconds(totalTrackedTime)
        },
        topApp: {
            name: topAppName,
            duration: topAppDuration,
            formattedDuration: formatDurationFromSeconds(topAppDuration),
            percentage: Math.round(topAppPercentage)
        },
        productivity: {
            level: productivityLevel,
            emoji: productivityEmoji,
            score: Math.round(activeTimePercentage)
        },
        appBreakdown: stats.appBreakdown || [],
        totalActivities: stats.totalActivities || 0,
        idleCount: stats.idleCount || 0
    };
};

const getAppsList = async (matchQuery) => {
    console.log('matchQuery of applist:', matchQuery);
    return ActivityEvent.aggregate([
        {
            $match: matchQuery
        },
        {
            $match: {
                app: {
                    $exists: true,
                    $nin: ["unknown", "LockApp.exe", "ShellHost.exe", "SearchHost.exe", "FeedbackHub.exe"]
                }
            }
        },
        {
            $group: {
                _id: "$app",
                totalDuration: {
                    $sum: { $ifNull: ["$duration", 0] }
                },
                usageCount: { $sum: 1 },
                uniqueTitles: { $addToSet: "$title" }
            }
        },
        {
            $project: {
                _id: 0,
                app: "$_id",
                totalDuration: 1,
                usageCount: 1,
                uniqueTitleCount: { $size: "$uniqueTitles" },
                averageDuration: {
                    $cond: [
                        { $eq: ["$usageCount", 0] },
                        0,
                        { $divide: ["$totalDuration", "$usageCount"] }
                    ]
                }
            }
        },
        {
            $sort: { totalDuration: -1 }
        }
    ]);
};

// Service method with grouping by title
const getAppHistory = async (matchQuery, sortOptions, skip, limit) => {
    // First, get the total count of unique titles
    const distinctTitlesPipeline = [
        { $match: matchQuery },
        { $group: { _id: "$title" } },
        { $count: "total" }
    ];

    const totalCountResult = await ActivityEvent.aggregate(distinctTitlesPipeline);
    const totalCount = totalCountResult.length > 0 ? totalCountResult[0].total : 0;

    // Get paginated and grouped data
    const data = await ActivityEvent.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: {
                    title: "$title",
                    app: "$app"
                },
                totalDuration: { $sum: "$duration" },
                firstTimestamp: { $first: "$timestamp" },
                lastTimestamp: { $last: "$timestamp" },
                dates: { $addToSet: "$date" },
                // Keep track of all timestamps if needed
                timestamps: { $push: "$timestamp" }
            }
        },
        {
            $project: {
                _id: 0,
                title: "$_id.title",
                app: "$_id.app",
                totalDuration: 1,
                firstTimestamp: 1,
                lastTimestamp: 1,
                dates: 1,
                // Calculate average duration if needed
                avgDuration: { $avg: "$totalDuration" },
                // Count of occurrences
                occurrences: { $size: "$timestamps" },
                // Format total duration
                formattedDuration: {
                    $let: {
                        vars: {
                            hours: { $floor: { $divide: ["$totalDuration", 3600] } },
                            minutes: { $floor: { $divide: [{ $mod: ["$totalDuration", 3600] }, 60] } },
                            seconds: { $mod: ["$totalDuration", 60] }
                        },
                        in: {
                            $concat: [
                                { $cond: [{ $gt: ["$$hours", 0] }, { $concat: [{ $toString: "$$hours" }, "h "] }, ""] },
                                { $cond: [{ $gt: ["$$minutes", 0] }, { $concat: [{ $toString: "$$minutes" }, "m "] }, ""] },
                                { $toString: "$$seconds" }, "s"
                            ]
                        }
                    }
                }
            }
        },
        { $sort: sortOptions },
        { $skip: skip },
        { $limit: limit }
    ]);

    return {
        data,
        pagination: {
            total: totalCount,
            page: Math.floor(skip / limit) + 1,
            limit: limit,
            totalPages: Math.ceil(totalCount / limit)
        }
    };
};

// NEW: Search across all activities
const getActivitySearch = async (matchQuery, sortOptions, skip, limit) => {
    const [data, totalCount] = await Promise.all([
        ActivityEvent.aggregate([
            { $match: matchQuery },
            { $sort: sortOptions },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    title: 1,
                    app: 1,
                    duration: 1,
                    timestamp: 1,
                    date: 1,
                    formattedDuration: {
                        $let: {
                            vars: {
                                hours: { $floor: { $divide: ["$duration", 3600] } },
                                minutes: { $floor: { $divide: [{ $mod: ["$duration", 3600] }, 60] } },
                                seconds: { $mod: ["$duration", 60] }
                            },
                            in: {
                                $concat: [
                                    { $cond: [{ $gt: ["$$hours", 0] }, { $concat: [{ $toString: "$$hours" }, "h "] }, ""] },
                                    { $cond: [{ $gt: ["$$minutes", 0] }, { $concat: [{ $toString: "$$minutes" }, "m "] }, ""] },
                                    { $toString: "$$seconds" }, "s"
                                ]
                            }
                        }
                    },
                    // Add search relevance score (optional)
                    searchScore: {
                        $meta: "textScore"
                    }
                }
            }
        ]),
        ActivityEvent.countDocuments(matchQuery)
    ]);

    return {
        data,
        pagination: {
            total: totalCount,
            page: Math.floor(skip / limit) + 1,
            limit: limit,
            totalPages: Math.ceil(totalCount / limit)
        }
    };
};

// NEW: Get activities by date range with advanced filtering
const getActivitiesByDateRange = async (matchQuery, sortOptions, skip, limit) => {
    // Get summary statistics for the date range
    const summary = await ActivityEvent.aggregate([
        { $match: matchQuery },
        {
            $facet: {
                totalDuration: [
                    {
                        $group: {
                            _id: null,
                            total: { $sum: { $ifNull: ["$duration", 0] } },
                            count: { $sum: 1 }
                        }
                    }
                ],
                appBreakdown: [
                    {
                        $group: {
                            _id: "$app",
                            duration: { $sum: { $ifNull: ["$duration", 0] } },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { duration: -1 } },
                    { $limit: 10 }
                ],
                dailyBreakdown: [
                    {
                        $group: {
                            _id: "$date",
                            duration: { $sum: { $ifNull: ["$duration", 0] } },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]
            }
        }
    ]);

    // Get paginated data
    const [data, totalCount] = await Promise.all([
        ActivityEvent.aggregate([
            { $match: matchQuery },
            { $sort: sortOptions },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    title: 1,
                    app: 1,
                    duration: 1,
                    timestamp: 1,
                    date: 1,
                    formattedDuration: {
                        $let: {
                            vars: {
                                hours: { $floor: { $divide: ["$duration", 3600] } },
                                minutes: { $floor: { $divide: [{ $mod: ["$duration", 3600] }, 60] } },
                                seconds: { $mod: ["$duration", 60] }
                            },
                            in: {
                                $concat: [
                                    { $cond: [{ $gt: ["$$hours", 0] }, { $concat: [{ $toString: "$$hours" }, "h "] }, ""] },
                                    { $cond: [{ $gt: ["$$minutes", 0] }, { $concat: [{ $toString: "$$minutes" }, "m "] }, ""] },
                                    { $toString: "$$seconds" }, "s"
                                ]
                            }
                        }
                    }
                }
            }
        ]),
        ActivityEvent.countDocuments(matchQuery)
    ]);

    const summaryData = summary[0] || {};
    const totalDuration = (summaryData.totalDuration && summaryData.totalDuration[0]) ? summaryData.totalDuration[0] : { total: 0, count: 0 };
    const formatDuration = (seconds) => {
        if (!seconds || seconds === 0) return '0s';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = (seconds % 60).toFixed(2);
        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
        return parts.join(' ');
    };

    return {
        data,
        pagination: {
            total: totalCount,
            page: Math.floor(skip / limit) + 1,
            limit: limit,
            totalPages: Math.ceil(totalCount / limit)
        },
        summary: {
            totalDuration: totalDuration.total || 0,
            formattedTotalDuration: formatDuration(totalDuration.total || 0),
            totalActivities: totalDuration.count || 0,
            appBreakdown: summaryData.appBreakdown || [],
            dailyBreakdown: summaryData.dailyBreakdown || []
        }
    };
};

module.exports = {
    exportActivityData,
    getTopActivities,
    getActivityData,
    getEmployeeStats,
    getAppsList,
    getAppHistory,
    getActivitySearch,
    getActivitiesByDateRange
};