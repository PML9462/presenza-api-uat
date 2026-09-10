const mongoose = require("mongoose");
const { reportService } = require('../../services/index');

const MONTH_FORMAT_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/; // YYYY-MM

const getMonthlyAttendance = async (req, res, next) => {
    console.log(`[getMonthlyAttendance] Request received with query: ${JSON.stringify(req.query)}`);
    const startTime = Date.now();
    
    try {
        const { month, employeeId } = req.query;

        // Validate month format
        if (month && !MONTH_FORMAT_REGEX.test(month)) {
            return res.status(400).json({
                success: false,
                message: "month must be in YYYY-MM format, e.g. 2026-09"
            });
        }

        // Validate employeeId
        if (employeeId && !mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid employeeId" 
            });
        }

        // Call service with caching and optimization
        const result = await reportService.getMonthlyAttendance({ 
            month, 
            employeeId,
            cacheKey: `attendance_${month || 'current'}_${employeeId || 'all'}`
        });

        const duration = Date.now() - startTime;
        console.log(`[getMonthlyAttendance] Completed in ${duration}ms`);

        // Add performance headers
        res.set('X-Response-Time', `${duration}ms`);
        res.set('X-Cache-Status', result.fromCache ? 'HIT' : 'MISS');

        return res.status(200).json({ 
            success: true, 
            data: result,
            meta: {
                responseTime: duration,
                cached: result.fromCache || false
            }
        });
    } catch (error) {
        console.error(`[getMonthlyAttendance] Error: ${error.message}`, { 
            stack: error.stack,
            query: req.query 
        });

        if (error.statusCode) {
            return res.status(error.statusCode).json({ 
                success: false, 
                message: error.message 
            });
        }
        return next(error);
    }
};

// Paginated version for large datasets
const getMonthlyAttendancePaginated = async (req, res, next) => {
    console.log(`[getMonthlyAttendancePaginated] Request received with query: ${JSON.stringify(req.query)}`);
    
    try {
        const { 
            month, 
            employeeId, 
            page = 1, 
            limit = 50,
            sortBy = 'fullName',
            sortOrder = 'asc'
        } = req.query;

        // Validate inputs
        if (month && !MONTH_FORMAT_REGEX.test(month)) {
            return res.status(400).json({
                success: false,
                message: "month must be in YYYY-MM format"
            });
        }

        if (employeeId && !mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid employeeId" 
            });
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

        const result = await reportService.getMonthlyAttendancePaginated({
            month,
            employeeId,
            page: pageNum,
            limit: limitNum,
            sortBy,
            sortOrder
        });

        return res.status(200).json({ 
            success: true, 
            data: result,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: result.totalEmployees,
                totalPages: Math.ceil(result.totalEmployees / limitNum)
            }
        });
    } catch (error) {
        console.error(`[getMonthlyAttendancePaginated] Error: ${error.message}`, { stack: error.stack });
        
        if (error.statusCode) {
            return res.status(error.statusCode).json({ 
                success: false, 
                message: error.message 
            });
        }
        return next(error);
    }
};

// Summary version (lighter response for dashboards)
const getMonthlyAttendanceSummary = async (req, res, next) => {
    console.log(`[getMonthlyAttendanceSummary] Request received with query: ${JSON.stringify(req.query)}`);
    
    try {
        const { month, departmentId } = req.query;

        if (month && !MONTH_FORMAT_REGEX.test(month)) {
            return res.status(400).json({
                success: false,
                message: "month must be in YYYY-MM format"
            });
        }

        const result = await reportService.getMonthlyAttendanceSummary({
            month,
            departmentId
        });

        return res.status(200).json({ 
            success: true, 
            data: result 
        });
    } catch (error) {
        console.error(`[getMonthlyAttendanceSummary] Error: ${error.message}`, { stack: error.stack });
        
        if (error.statusCode) {
            return res.status(error.statusCode).json({ 
                success: false, 
                message: error.message 
            });
        }
        return next(error);
    }
};

module.exports = {
    getMonthlyAttendance,
    getMonthlyAttendancePaginated,
    getMonthlyAttendanceSummary
};