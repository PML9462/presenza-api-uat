// const { ObjectId } = require('mongodb');
// const { activityService } = require('../../services/index');

// const getTopActivities = async (req, res) => {
//     try {
//         const { employeeId, date } = req.query || {};

//         if (!employeeId) {
//             return res.status(400).json({
//                 message: "employeeId is required",
//             });
//         }

//         let targetDate;
//         if (date) {
//             targetDate = new Date(date);
//             if (isNaN(targetDate.getTime())) {
//                 return res.status(400).json({
//                     message: "Invalid date format. Use YYYY-MM-DD",
//                 });
//             }
//         } else {
//             targetDate = new Date();
//         }

//         const start = new Date(targetDate);
//         start.setHours(0, 0, 0, 0);

//         const end = new Date(targetDate);
//         end.setHours(23, 59, 59, 999);

//         const matchQuery = {
//             employeeId: new ObjectId(employeeId),
//             timestamp: {
//                 $gte: start,
//                 $lte: end,
//             },
//         };

//         const activities = await activityService.getTopActivities(matchQuery);

//         res.status(200).json(activities);
//     } catch (error) {
//         console.error("Error fetching top activities:", error);
//         res.status(500).json({
//             message: "Internal server error",
//         });
//     }
// };

// const getActivityData = async (req, res) => {
//     try {
//         const { employeeId, date } = req.query;

//         if (!employeeId) {
//             return res.status(400).json({
//                 message: "employeeId is required",
//             });
//         }

//         let targetDate;
//         if (date) {
//             targetDate = new Date(date);
//             if (isNaN(targetDate.getTime())) {
//                 return res.status(400).json({
//                     message: "Invalid date format. Use YYYY-MM-DD",
//                 });
//             }
//         } else {
//             targetDate = new Date();
//         }

//         const start = new Date(targetDate);
//         start.setHours(0, 0, 0, 0);

//         const end = new Date(targetDate);
//         end.setHours(23, 59, 59, 999);

//         const matchQuery = {
//             employeeId: new ObjectId(employeeId),
//             timestamp: {
//                 $gte: start,
//                 $lte: end,
//             },
//         };

//         console.log("Match Query:", matchQuery);

//         const activities = await activityService.getActivityData(matchQuery);

//         console.log("Activities Count:", activities.length);

//         return res.status(200).json(activities);
//     } catch (error) {
//         console.error("Error fetching activity data:", error);
//         return res.status(500).json({
//             message: "Internal server error",
//             error: error.message,
//         });
//     }
// };

// const getEmployeeStats = async (req, res) => {
//     try {
//         const { employeeId, date } = req.query;

//         if (!employeeId) {
//             return res.status(400).json({
//                 message: "employeeId is required",
//             });
//         }

//         let targetDate;
//         if (date) {
//             targetDate = new Date(date);
//             if (isNaN(targetDate.getTime())) {
//                 return res.status(400).json({
//                     message: "Invalid date format. Use YYYY-MM-DD",
//                 });
//             }
//         } else {
//             targetDate = new Date();
//         }

//         const start = new Date(targetDate);
//         start.setHours(0, 0, 0, 0);

//         const end = new Date(targetDate);
//         end.setHours(23, 59, 59, 999);

//         const matchQuery = {
//             employeeId: new ObjectId(employeeId),
//             timestamp: {
//                 $gte: start,
//                 $lte: end,
//             },
//         };

//         const stats = await activityService.getEmployeeStats(matchQuery);

//         return res.status(200).json(stats);
//     } catch (error) {
//         console.error("Error fetching employee stats:", error);
//         return res.status(500).json({
//             message: "Internal server error",
//             error: error.message,
//         });
//     }
// };

// // // NEW: Get all apps used by an employee with summary stats
// // const getAppsList = async (req, res) => {
// //     try {
// //         const { employeeId, startDate, endDate } = req.query;

// //         if (!employeeId) {
// //             return res.status(400).json({
// //                 message: "employeeId is required",
// //             });
// //         }

// //         let matchQuery = {
// //             employeeId: new ObjectId(employeeId),
// //         };

// //         // Date range filter
// //         if (startDate || endDate) {
// //             matchQuery.timestamp = {};
// //             if (startDate) {
// //                 const start = new Date(startDate);
// //                 if (isNaN(start.getTime())) {
// //                     return res.status(400).json({
// //                         message: "Invalid startDate format. Use YYYY-MM-DD",
// //                     });
// //                 }
// //                 start.setHours(0, 0, 0, 0);
// //                 matchQuery.timestamp.$gte = start;
// //             }
// //             if (endDate) {
// //                 const end = new Date(endDate);
// //                 if (isNaN(end.getTime())) {
// //                     return res.status(400).json({
// //                         message: "Invalid endDate format. Use YYYY-MM-DD",
// //                     });
// //                 }
// //                 end.setHours(23, 59, 59, 999);
// //                 matchQuery.timestamp.$lte = end;
// //             }
// //         }

// //         const apps = await activityService.getAppsList(matchQuery);
// //         return res.status(200).json(apps);
// //     } catch (error) {
// //         console.error("Error fetching apps list:", error);
// //         return res.status(500).json({
// //             message: "Internal server error",
// //             error: error.message,
// //         });
// //     }
// // };
// // NEW: Get all apps used by an employee with summary stats
// const getAppsList = async (req, res) => {
//     try {
//         const { employeeId, startDate, endDate } = req.query;

//         if (!employeeId) {
//             return res.status(400).json({
//                 message: "employeeId is required",
//             });
//         }

//         let matchQuery = {
//             employeeId: new ObjectId(employeeId),
//         };

//         // If no date range provided, default to today
//         if (!startDate && !endDate) {
//             const today = new Date();
//             const start = new Date(today);
//             start.setHours(0, 0, 0, 0);
//             const end = new Date(today);
//             end.setHours(23, 59, 59, 999);

//             matchQuery.timestamp = {
//                 $gte: start,
//                 $lte: end,
//             };
//         } else {
//             // Date range filter with provided dates
//             matchQuery.timestamp = {};
//             if (startDate) {
//                 const start = new Date(startDate);
//                 if (isNaN(start.getTime())) {
//                     return res.status(400).json({
//                         message: "Invalid startDate format. Use YYYY-MM-DD",
//                     });
//                 }
//                 start.setHours(0, 0, 0, 0);
//                 matchQuery.timestamp.$gte = start;
//             }
//             if (endDate) {
//                 const end = new Date(endDate);
//                 if (isNaN(end.getTime())) {
//                     return res.status(400).json({
//                         message: "Invalid endDate format. Use YYYY-MM-DD",
//                     });
//                 }
//                 end.setHours(23, 59, 59, 999);
//                 matchQuery.timestamp.$lte = end;
//             }
//         }

//         const apps = await activityService.getAppsList(matchQuery);
//         return res.status(200).json(apps);
//     } catch (error) {
//         console.error("Error fetching apps list:", error);
//         return res.status(500).json({
//             message: "Internal server error",
//             error: error.message,
//         });
//     }
// };
// // NEW: Get history for a specific app with sorting and pagination
// const getAppHistory = async (req, res) => {
//     try {
//         const {
//             employeeId,
//             app,
//             startDate,
//             endDate,
//             sortBy = 'timestamp',
//             sortOrder = 'desc',
//             page = 1,
//             limit = 50,
//             search = ''
//         } = req.query;

//         if (!employeeId) {
//             return res.status(400).json({
//                 message: "employeeId is required",
//             });
//         }

//         if (!app) {
//             return res.status(400).json({
//                 message: "app parameter is required",
//             });
//         }

//         let matchQuery = {
//             employeeId: new ObjectId(employeeId),
//             app: app,
//         };

//         // Date range filter
//         if (startDate || endDate) {
//             matchQuery.timestamp = {};
//             if (startDate) {
//                 const start = new Date(startDate);
//                 if (isNaN(start.getTime())) {
//                     return res.status(400).json({
//                         message: "Invalid startDate format. Use YYYY-MM-DD",
//                     });
//                 }
//                 start.setHours(0, 0, 0, 0);
//                 matchQuery.timestamp.$gte = start;
//             }
//             if (endDate) {
//                 const end = new Date(endDate);
//                 if (isNaN(end.getTime())) {
//                     return res.status(400).json({
//                         message: "Invalid endDate format. Use YYYY-MM-DD",
//                     });
//                 }
//                 end.setHours(23, 59, 59, 999);
//                 matchQuery.timestamp.$lte = end;
//             }
//         } else {
//             const today = new Date();
//             const start = new Date(today);
//             start.setHours(0, 0, 0, 0);
//             const end = new Date(today);
//             end.setHours(23, 59, 59, 999);

//             matchQuery.timestamp = {
//                 $gte: start,
//                 $lte: end,
//             };
//         }

//         // Search filter
//         if (search) {
//             matchQuery.title = { $regex: search, $options: 'i' };
//         }

//         // Sorting
//         const sortOptions = {};
//         sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

//         // Pagination
//         const skip = (parseInt(page) - 1) * parseInt(limit);
//         const limitNum = parseInt(limit);

//         const result = await activityService.getAppHistory(
//             matchQuery,
//             sortOptions,
//             skip,
//             limitNum
//         );

//         return res.status(200).json(result);
//     } catch (error) {
//         console.error("Error fetching app history:", error);
//         return res.status(500).json({
//             message: "Internal server error",
//             error: error.message,
//         });
//     }
// };

// // NEW: Search across all activities with advanced filtering
// const getActivitySearch = async (req, res) => {
//     try {
//         const {
//             employeeId,
//             search,
//             app,
//             startDate,
//             endDate,
//             sortBy = 'timestamp',
//             sortOrder = 'desc',
//             page = 1,
//             limit = 50
//         } = req.query;

//         if (!employeeId) {
//             return res.status(400).json({
//                 message: "employeeId is required",
//             });
//         }

//         if (!search) {
//             return res.status(400).json({
//                 message: "search parameter is required",
//             });
//         }

//         let matchQuery = {
//             employeeId: new ObjectId(employeeId),
//             title: { $regex: search, $options: 'i' }
//         };

//         // App filter
//         if (app) {
//             matchQuery.app = app;
//         }

//         // Date range filter
//         if (startDate || endDate) {
//             matchQuery.timestamp = {};
//             if (startDate) {
//                 const start = new Date(startDate);
//                 if (isNaN(start.getTime())) {
//                     return res.status(400).json({
//                         message: "Invalid startDate format. Use YYYY-MM-DD",
//                     });
//                 }
//                 start.setHours(0, 0, 0, 0);
//                 matchQuery.timestamp.$gte = start;
//             }
//             if (endDate) {
//                 const end = new Date(endDate);
//                 if (isNaN(end.getTime())) {
//                     return res.status(400).json({
//                         message: "Invalid endDate format. Use YYYY-MM-DD",
//                     });
//                 }
//                 end.setHours(23, 59, 59, 999);
//                 matchQuery.timestamp.$lte = end;
//             }
//         }

//         // Sorting
//         const sortOptions = {};
//         sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

//         // Pagination
//         const skip = (parseInt(page) - 1) * parseInt(limit);
//         const limitNum = parseInt(limit);

//         const result = await activityService.getActivitySearch(
//             matchQuery,
//             sortOptions,
//             skip,
//             limitNum
//         );

//         return res.status(200).json(result);
//     } catch (error) {
//         console.error("Error searching activities:", error);
//         return res.status(500).json({
//             message: "Internal server error",
//             error: error.message,
//         });
//     }
// };

// // NEW: Get activities within custom date range with advanced filtering
// const getActivitiesByDateRange = async (req, res) => {
//     try {
//         const {
//             employeeId,
//             startDate,
//             endDate,
//             app,
//             sortBy = 'timestamp',
//             sortOrder = 'desc',
//             page = 1,
//             limit = 50,
//             search = ''
//         } = req.query;

//         if (!employeeId) {
//             return res.status(400).json({
//                 message: "employeeId is required",
//             });
//         }

//         if (!startDate || !endDate) {
//             return res.status(400).json({
//                 message: "startDate and endDate are required",
//             });
//         }

//         const start = new Date(startDate);
//         if (isNaN(start.getTime())) {
//             return res.status(400).json({
//                 message: "Invalid startDate format. Use YYYY-MM-DD",
//             });
//         }
//         start.setHours(0, 0, 0, 0);

//         const end = new Date(endDate);
//         if (isNaN(end.getTime())) {
//             return res.status(400).json({
//                 message: "Invalid endDate format. Use YYYY-MM-DD",
//             });
//         }
//         end.setHours(23, 59, 59, 999);

//         let matchQuery = {
//             employeeId: new ObjectId(employeeId),
//             timestamp: {
//                 $gte: start,
//                 $lte: end,
//             }
//         };

//         // App filter
//         if (app) {
//             matchQuery.app = app;
//         }

//         // Search filter
//         if (search) {
//             matchQuery.title = { $regex: search, $options: 'i' };
//         }

//         // Sorting
//         const sortOptions = {};
//         sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

//         // Pagination
//         const skip = (parseInt(page) - 1) * parseInt(limit);
//         const limitNum = parseInt(limit);

//         const result = await activityService.getActivitiesByDateRange(
//             matchQuery,
//             sortOptions,
//             skip,
//             limitNum
//         );

//         return res.status(200).json(result);
//     } catch (error) {
//         console.error("Error fetching activities by date range:", error);
//         return res.status(500).json({
//             message: "Internal server error",
//             error: error.message,
//         });
//     }
// };

// module.exports = {
//     getTopActivities,
//     getActivityData,
//     getEmployeeStats,
//     getAppsList,
//     getAppHistory,
//     getActivitySearch,
//     getActivitiesByDateRange
// };


const { ObjectId } = require('mongodb');
const { activityService } = require('../../services/index');

// ---------------------------------------------------------------------------
// Date filter helpers
// ---------------------------------------------------------------------------
// Root cause of the old bugs: date filters were built with
//   new Date(dateString); d.setHours(0,0,0,0) / setHours(23,59,59,999)
// setHours() uses the SERVER's local timezone. On any server not running in
// IST (containers/cloud VMs almost always run UTC) this silently shifts the
// day boundary by up to 5.5 hours, so records near midnight IST fell into
// the wrong day (or got dropped entirely). getAppsList also matched on
// `createdAt` while every other endpoint matched on `timestamp`, so the two
// endpoints could disagree on the same request.
//
// Fix: every document already stores a precomputed `date` string
// (e.g. "2026-08-06", see exportActivityData below). That string needs no
// timezone math at query time — comparing "YYYY-MM-DD" strings directly is
// both correct and timezone-safe (lexicographic order == chronological
// order for this format). So we now filter on `date` everywhere instead of
// re-deriving UTC start/end instants from `timestamp`/`createdAt`.
const DATE_STRING_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Matches the convention used when documents are written (see
// exportActivityData: date = e.timestamp.slice(0, 10)) so "today" here means
// the same calendar day that would be assigned to a document created right now.
const getTodayDateString = () => new Date().toISOString().slice(0, 10);

// Normalizes a date query param to a "YYYY-MM-DD" string.
// - Already-correct strings ("2026-08-06") are used as-is (no re-parsing,
//   so no timezone can sneak in).
// - Anything else is parsed and re-sliced the same way `date` is written on
//   documents, so the filter matches how the data was actually stored.
// Returns null if the input can't be turned into a date at all.
const normalizeDateParam = (input) => {
    if (!input) return null;
    if (DATE_STRING_REGEX.test(input)) return input;

    const parsed = new Date(input);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
};

const getTopActivities = async (req, res) => {
    try {
        const { employeeId, date } = req.query || {};

        if (!employeeId) {
            return res.status(400).json({
                message: "employeeId is required",
            });
        }

        let dateStr;
        if (date) {
            dateStr = normalizeDateParam(date);
            if (!dateStr) {
                return res.status(400).json({
                    message: "Invalid date format. Use YYYY-MM-DD",
                });
            }
        } else {
            dateStr = getTodayDateString();
        }

        const matchQuery = {
            employeeId: new ObjectId(employeeId),
            date: dateStr,
        };

        const activities = await activityService.getTopActivities(matchQuery);

        res.status(200).json(activities);
    } catch (error) {
        console.error("Error fetching top activities:", error);
        res.status(500).json({
            message: "Internal server error",
        });
    }
};

const getActivityData = async (req, res) => {
    try {
        const { employeeId, date } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                message: "employeeId is required",
            });
        }

        let dateStr;
        if (date) {
            dateStr = normalizeDateParam(date);
            if (!dateStr) {
                return res.status(400).json({
                    message: "Invalid date format. Use YYYY-MM-DD",
                });
            }
        } else {
            dateStr = getTodayDateString();
        }

        const matchQuery = {
            employeeId: new ObjectId(employeeId),
            date: dateStr,
        };

        console.log("Match Query:", matchQuery);

        const activities = await activityService.getActivityData(matchQuery);

        console.log("Activities Count:", activities.length);

        return res.status(200).json(activities);
    } catch (error) {
        console.error("Error fetching activity data:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const getEmployeeStats = async (req, res) => {
    try {
        const { employeeId, date } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                message: "employeeId is required",
            });
        }

        let dateStr;
        if (date) {
            dateStr = normalizeDateParam(date);
            if (!dateStr) {
                return res.status(400).json({
                    message: "Invalid date format. Use YYYY-MM-DD",
                });
            }
        } else {
            dateStr = getTodayDateString();
        }

        const matchQuery = {
            employeeId: new ObjectId(employeeId),
            date: dateStr,
        };

        // Pass the resolved date string through explicitly so the service's
        // IST office-hours window calculation doesn't have to guess it back
        // out of the match query.
        const stats = await activityService.getEmployeeStats(matchQuery, dateStr);

        return res.status(200).json(stats);
    } catch (error) {
        console.error("Error fetching employee stats:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

const getAppsList = async (req, res) => {
    try {
        const { employeeId, startDate, endDate } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                message: "employeeId is required",
            });
        }

        let matchQuery = {
            employeeId: new ObjectId(employeeId),
        };

        // If no date range provided, default to today
        if (!startDate && !endDate) {
            matchQuery.date = getTodayDateString();
        } else {
            // Date range filter with provided dates (string comparison on
            // "YYYY-MM-DD" is chronologically correct, no timezone math needed)
            matchQuery.date = {};
            if (startDate) {
                const s = normalizeDateParam(startDate);
                if (!s) {
                    return res.status(400).json({
                        message: "Invalid startDate format. Use YYYY-MM-DD",
                    });
                }
                matchQuery.date.$gte = s;
            }
            if (endDate) {
                const e = normalizeDateParam(endDate);
                if (!e) {
                    return res.status(400).json({
                        message: "Invalid endDate format. Use YYYY-MM-DD",
                    });
                }
                matchQuery.date.$lte = e;
            }
        }

        const apps = await activityService.getAppsList(matchQuery);
        return res.status(200).json(apps);
    } catch (error) {
        console.error("Error fetching apps list:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

// NEW: Get history for a specific app with sorting and pagination
const getAppHistory = async (req, res) => {
    try {
        const {
            employeeId,
            app,
            startDate,
            endDate,
            sortBy = 'timestamp',
            sortOrder = 'desc',
            page = 1,
            limit = 50,
            search = ''
        } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                message: "employeeId is required",
            });
        }

        if (!app) {
            return res.status(400).json({
                message: "app parameter is required",
            });
        }

        let matchQuery = {
            employeeId: new ObjectId(employeeId),
            app: app,
        };

        // Date range filter (on the precomputed `date` string field)
        if (startDate || endDate) {
            matchQuery.date = {};
            if (startDate) {
                const s = normalizeDateParam(startDate);
                if (!s) {
                    return res.status(400).json({
                        message: "Invalid startDate format. Use YYYY-MM-DD",
                    });
                }
                matchQuery.date.$gte = s;
            }
            if (endDate) {
                const e = normalizeDateParam(endDate);
                if (!e) {
                    return res.status(400).json({
                        message: "Invalid endDate format. Use YYYY-MM-DD",
                    });
                }
                matchQuery.date.$lte = e;
            }
        } else {
            matchQuery.date = getTodayDateString();
        }

        // Search filter
        if (search) {
            matchQuery.title = { $regex: search, $options: 'i' };
        }

        // Sorting
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const result = await activityService.getAppHistory(
            matchQuery,
            sortOptions,
            skip,
            limitNum
        );

        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching app history:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

// NEW: Search across all activities with advanced filtering
const getActivitySearch = async (req, res) => {
    try {
        const {
            employeeId,
            search,
            app,
            startDate,
            endDate,
            sortBy = 'timestamp',
            sortOrder = 'desc',
            page = 1,
            limit = 50
        } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                message: "employeeId is required",
            });
        }

        if (!search) {
            return res.status(400).json({
                message: "search parameter is required",
            });
        }

        let matchQuery = {
            employeeId: new ObjectId(employeeId),
            title: { $regex: search, $options: 'i' }
        };

        // App filter
        if (app) {
            matchQuery.app = app;
        }

        // Date range filter (on the precomputed `date` string field)
        if (startDate || endDate) {
            matchQuery.date = {};
            if (startDate) {
                const s = normalizeDateParam(startDate);
                if (!s) {
                    return res.status(400).json({
                        message: "Invalid startDate format. Use YYYY-MM-DD",
                    });
                }
                matchQuery.date.$gte = s;
            }
            if (endDate) {
                const e = normalizeDateParam(endDate);
                if (!e) {
                    return res.status(400).json({
                        message: "Invalid endDate format. Use YYYY-MM-DD",
                    });
                }
                matchQuery.date.$lte = e;
            }
        }

        // Sorting
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const result = await activityService.getActivitySearch(
            matchQuery,
            sortOptions,
            skip,
            limitNum
        );

        return res.status(200).json(result);
    } catch (error) {
        console.error("Error searching activities:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

// NEW: Get activities within custom date range with advanced filtering
const getActivitiesByDateRange = async (req, res) => {
    try {
        const {
            employeeId,
            startDate,
            endDate,
            app,
            sortBy = 'timestamp',
            sortOrder = 'desc',
            page = 1,
            limit = 50,
            search = ''
        } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                message: "employeeId is required",
            });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({
                message: "startDate and endDate are required",
            });
        }

        const startDateStr = normalizeDateParam(startDate);
        if (!startDateStr) {
            return res.status(400).json({
                message: "Invalid startDate format. Use YYYY-MM-DD",
            });
        }

        const endDateStr = normalizeDateParam(endDate);
        if (!endDateStr) {
            return res.status(400).json({
                message: "Invalid endDate format. Use YYYY-MM-DD",
            });
        }

        let matchQuery = {
            employeeId: new ObjectId(employeeId),
            date: {
                $gte: startDateStr,
                $lte: endDateStr,
            }
        };

        // App filter
        if (app) {
            matchQuery.app = app;
        }

        // Search filter
        if (search) {
            matchQuery.title = { $regex: search, $options: 'i' };
        }

        // Sorting
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const result = await activityService.getActivitiesByDateRange(
            matchQuery,
            sortOptions,
            skip,
            limitNum
        );

        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching activities by date range:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error.message,
        });
    }
};

module.exports = {
    getTopActivities,
    getActivityData,
    getEmployeeStats,
    getAppsList,
    getAppHistory,
    getActivitySearch,
    getActivitiesByDateRange
};