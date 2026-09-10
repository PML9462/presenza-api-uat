const admin = require('../utils/firebase');
const Device = require("../models/device.model");
const Employee = require("../models/employee.model");
const Attendance = require("../models/attendance.model"); // Add this import
const mongoose = require('mongoose');

/**
 * Get personalized reminder messages
 */
const getReminderMessages = (type, employeeName = '') => {
    const namePrefix = employeeName ? `${employeeName}, ` : '';

    const messages = {
        PUNCH_IN: {
            title: "⏰ Good Morning! Time to Start Your Day",
            body: `${namePrefix}Please punch in to mark your arrival and start your workday.`,
        },
        PUNCH_OUT: {
            title: "🏠 End of Day - Time to Punch Out",
            body: `${namePrefix}Please punch out before leaving. Have a great evening!`,
        },
        LATE_REMINDER: {
            title: "⚠️ Attendance Reminder",
            body: `${namePrefix}You haven't punched in yet. Please mark your attendance now.`,
        },
        BREAK_START: {
            title: "☕ Break Time Reminder",
            body: `${namePrefix}Your break time has started. Please punch out for break.`,
        },
        BREAK_END: {
            title: "🔙 Break Time Over",
            body: `${namePrefix}Please punch in to resume your work.`,
        },
        OVERTIME: {
            title: "⏱️ Overtime Reminder",
            body: `${namePrefix}You're working beyond regular hours. Please log your overtime.`,
        }
    };

    return messages[type] || messages.PUNCH_IN;
};

/**
 * Send push notification with sound even on silent mode
 */
const sendPushNotification = async ({
    token,
    title,
    body,
    data = {},
    sound = "default",
    critical = false,
}) => {
    try {
        if (!token) {
            throw new Error("FCM token is required.");
        }

        const message = {
            token,
            notification: {
                title,
                body,
            },
            data: Object.fromEntries(
                Object.entries(data).map(([key, value]) => [
                    key,
                    String(value),
                ])
            ),
            android: {
                priority: "high",
                notification: {
                    sound: sound,
                    channelId: "attendance",
                    defaultSound: true,
                },
            },
            apns: {
                headers: {
                    "apns-priority": "10",
                    "apns-push-type": "alert",
                    ...(critical && { "apns-critical": "1" })
                },
                payload: {
                    aps: {
                        sound: {
                            critical: critical ? 1 : 0,
                            name: sound === "default" ? "default" : sound,
                            volume: critical ? 1.0 : 0.8,
                        },
                        alert: {
                            title,
                            body,
                        },
                        badge: 1,
                        "mutable-content": 1,
                        "content-available": 1,
                    },
                },
            },
        };

        // For critical alerts on Android, use a different approach
        if (critical) {
            message.android = {
                ...message.android,
                priority: "high",
                notification: {
                    ...message.android.notification,
                    channelId: "attendance_critical",
                    defaultSound: true,
                    defaultVibrateTimings: true,
                },
            };
        }

        const response = await admin.messaging().send(message);

        console.log("✅ Push notification sent:", response);

        return {
            success: true,
            response,
        };
    } catch (error) {
        console.error("❌ Error sending push notification:", error);

        return {
            success: false,
            error: error.message,
            code: error.code || 'unknown',
        };
    }
};

/**
 * Get employee name by ID
 */
const getEmployeeName = async (employeeId) => {
    try {
        if (!employeeId) return '';

        // Check if employeeId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            console.log(`Invalid ObjectId: ${employeeId}`);
            return '';
        }

        const employee = await Employee.findById(employeeId).select('fullName').lean();

        if (employee && employee.fullName) {
            return employee.fullName;
        }

        return '';
    } catch (error) {
        console.error(`Error fetching employee name for ID ${employeeId}:`, error);
        return '';
    }
};

/**
 * Check if today is a working day
 * Sunday is off, and 2nd and 4th Saturdays are off
 */
const isWorkingDay = () => {
    const today = new Date();
    const day = today.getDay(); // 0 = Sunday, 6 = Saturday
    const date = today.getDate();

    // Sunday (0) is off
    if (day === 0) {
        return false;
    }

    // Check for 2nd and 4th Saturdays
    if (day === 6) {
        // Calculate which Saturday of the month
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstSaturday = 6 - firstDayOfMonth.getDay(); // Days until first Saturday
        const saturdayCount = Math.ceil((date - firstSaturday) / 7);

        // 2nd or 4th Saturday is off
        if (saturdayCount === 2 || saturdayCount === 4) {
            return false;
        }
    }

    return true;
};

// /**
//  * Check if employee has punched in today
//  */
// const hasEmployeePunchedIn = async (employeeId, date) => {
//     try {
//         const attendance = await Attendance.findOne({
//             employee: employeeId,
//             createdAt: {
//                 $gte: new Date(date.setHours(0, 0, 0, 0)),
//                 $lt: new Date(date.setHours(23, 59, 59, 999))
//             }
//         });

//         console.log(`Checking punch in for employee ${employeeId} on ${date.toISOString()}:`, attendance);

//         if (!attendance) {
//             return false;
//         }

//         // Check if there's at least one session with a punch in
//         return attendance.sessions && attendance.sessions.length > 0 &&
//             attendance.sessions.some(session => session.punchIn);
//     } catch (error) {
//         console.error(`Error checking punch in for employee ${employeeId}:`, error);
//         return false;
//     }
// };

const hasEmployeePunchedIn = async (employeeId, date) => {
    try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const attendance = await Attendance.findOne({
            employee: employeeId,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });

        console.log(`Checking punch in for employee ${employeeId} on ${date.toISOString()}:`, attendance);

        if (!attendance) {
            return false;
        }

        return attendance.sessions && attendance.sessions.length > 0 &&
            attendance.sessions.some(session => session.punchIn);
    } catch (error) {
        console.error(`Error checking punch in for employee ${employeeId}:`, error);
        return false;
    }
};

/**
 * Check if employee has punched out today
 */
const hasEmployeePunchedOut = async (employeeId, date) => {
    try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const attendance = await Attendance.findOne({
            employee: employeeId,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });

        if (!attendance) {
            return false;
        }

        // Check if there's at least one session with a punch out
        return attendance.sessions && attendance.sessions.length > 0 &&
            attendance.sessions.some(session => session.punchOut);
    } catch (error) {
        console.error(`Error checking punch out for employee ${employeeId}:`, error);
        return false;
    }
};

/**
 * Send attendance reminder to eligible employees
 * @param {string} type - PUNCH_IN or PUNCH_OUT
 * @param {Date} reminderTime - Time when reminder is sent
 */
const sendAttendanceReminder = async (type, reminderTime = new Date()) => {
    try {
        // Check if today is a working day
        if (!isWorkingDay()) {
            console.log(`Today is a holiday/off day. No reminders sent.`);
            return {
                success: true,
                total: 0,
                message: "Today is a non-working day",
            };
        }

        const today = new Date(reminderTime);
        today.setHours(0, 0, 0, 0);

        // Get all devices with FCM tokens
        const devices = await Device.find({
            fcmToken: {
                $exists: true,
                $ne: null,
            },
        }).populate('employee', 'fullName'); // Populate employee data

        if (devices.length === 0) {
            console.log("No devices with FCM tokens found.");
            return {
                success: true,
                total: 0,
                message: "No devices found",
            };
        }

        console.log(`📤 Sending ${type} reminders to ${devices.length} devices...`);

        let successCount = 0;
        let failureCount = 0;
        let skippedCount = 0;
        const results = [];

        // Group devices by employee to avoid duplicate DB calls
        const employeeNameCache = new Map();

        for (const device of devices) {
            try {
                // Skip if device doesn't have employee associated
                if (!device.employee) {
                    skippedCount++;
                    results.push({
                        deviceId: device._id,
                        status: 'skipped',
                        reason: 'No employee associated'
                    });
                    continue;
                }

                let employeeId = device.employee;
                let employeeNameForDevice = '';

                // Get employee name and ID
                if (typeof device.employee === 'object' && device.employee._id) {
                    employeeId = device.employee._id;
                    employeeNameForDevice = device.employee.fullName || '';
                } else if (typeof device.employee === 'string' || device.employee instanceof mongoose.Types.ObjectId) {
                    // Check cache first
                    const empId = device.employee.toString();
                    if (employeeNameCache.has(empId)) {
                        employeeNameForDevice = employeeNameCache.get(empId);
                    } else {
                        // Fetch from database
                        employeeNameForDevice = await getEmployeeName(empId);
                        employeeNameCache.set(empId, employeeNameForDevice);
                    }
                }

                // Check if employee should receive reminder based on type
                let shouldSend = false;
                let skipReason = '';

                if (type === 'PUNCH_IN') {
                    const hasPunchedIn = await hasEmployeePunchedIn(employeeId, new Date(today));

                    console.log(`Employee ${employeeNameForDevice || 'Unknown'} (ID: ${employeeId}) - PUNCH_IN check: ${hasPunchedIn ? 'Already punched in' : 'Not punched in yet'}`);

                    if (hasPunchedIn) {
                        shouldSend = false;
                        skipReason = 'Already punched in today';
                    } else {
                        shouldSend = true;
                    }
                } else if (type === 'PUNCH_OUT') {
                    const hasPunchedOut = await hasEmployeePunchedOut(employeeId, new Date(today));
                    console.log(`Employee ${employeeNameForDevice || 'Unknown'} (ID: ${employeeId}) - PUNCH_OUT check: ${hasPunchedOut ? 'Already punched out' : 'Not punched out yet'}`);

                    if (hasPunchedOut) {
                        shouldSend = false;
                        skipReason = 'Already punched out today';
                    } else {
                        shouldSend = true;
                    }
                }

                if (!shouldSend) {
                    skippedCount++;
                    results.push({
                        deviceId: device._id,
                        employeeName: employeeNameForDevice || 'Unknown',
                        status: 'skipped',
                        reason: skipReason
                    });
                    console.log(`⏭️ Skipping device ${device._id} (${employeeNameForDevice || 'Unknown'}): ${skipReason}`);
                    continue;
                }

                // Get personalized messages with employee name
                const messages = getReminderMessages(type, employeeNameForDevice);

                // Critical notifications for important reminders
                const isCritical = type === 'LATE_REMINDER' || type === 'OVERTIME';

                // Use custom sound for critical notifications
                const sound = isCritical ? 'alert' : 'default';

                const result = await sendPushNotification({
                    token: device.fcmToken,
                    title: messages.title,
                    body: messages.body,
                    data: {
                        type,
                        timestamp: new Date().toISOString(),
                        ...(employeeNameForDevice && { employeeName: employeeNameForDevice }),
                        deviceId: device._id.toString(),
                        reminderType: type,
                    },
                    sound: sound,
                    critical: isCritical,
                });

                if (result.success) {
                    successCount++;
                    results.push({
                        deviceId: device._id,
                        status: 'success',
                        employeeName: employeeNameForDevice || 'Unknown'
                    });
                    console.log(`✅ Notification sent to device ${device._id} (${employeeNameForDevice || 'Unknown'})`);
                } else {
                    // Check if token is invalid
                    const errorMsg = result.error.toLowerCase();
                    if (
                        errorMsg.includes('registration-token-not-registered') ||
                        errorMsg.includes('requested entity was not found') ||
                        errorMsg.includes('invalid registration') ||
                        errorMsg.includes('not registered') ||
                        errorMsg.includes('invalid-argument')
                    ) {
                        await Device.findByIdAndUpdate(device._id, {
                            $unset: { fcmToken: 1 },
                        });
                        console.log(`🗑️ Removed invalid FCM token for device ${device._id}`);
                        results.push({ deviceId: device._id, status: 'invalid_token' });
                    } else {
                        failureCount++;
                        results.push({ deviceId: device._id, status: 'failed', error: result.error });
                        console.log(`❌ Failed to send to device ${device._id}: ${result.error}`);
                    }
                }
            } catch (error) {
                failureCount++;
                results.push({ deviceId: device._id, status: 'error', error: error.message });
                console.error(`❌ Error sending to device ${device._id}:`, error);
            }
        }

        console.log(`📊 Reminder Summary: ${successCount} sent successfully, ${skippedCount} skipped, ${failureCount} failed`);

        return {
            success: true,
            total: devices.length,
            successful: successCount,
            skipped: skippedCount,
            failed: failureCount,
            results,
        };
    } catch (error) {
        console.error("❌ Attendance reminder failed:", error);
        return {
            success: false,
            error: error.message,
        };
    }
};

/**
 * Schedule reminders with follow-ups
 * This function should be called by a cron job at specified times
 */
const scheduleReminders = async (type = null) => {
    try {
        const now = new Date();
        // Convert to IST
        const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const hour = istTime.getHours();
        const minute = istTime.getMinutes();
        const day = istTime.getDay();

        // Don't send reminders on weekends (Saturday=6, Sunday=0) or holidays
        if (!isWorkingDay(istTime)) {
            console.log(`📅 Today is a non-working day. No reminders scheduled.`);
            return {
                success: true,
                message: "Non-working day"
            };
        }

        console.log(`⏰ Running scheduled reminders at ${istTime.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST`);

        const results = [];
        const reminderTime = istTime;

        // PUNCH IN reminders - 9:25 AM, 9:30 AM, 9:35 AM IST
        if (hour == 9 && [25, 30, 35].includes(minute)) {
            const timeStr = minute == 25 ? '9:25 AM' :
                minute == 30 ? '9:30 AM' : '9:35 AM';
            console.log(`📢 Sending PUNCH_IN reminders (${timeStr} IST)`);
            const result = await sendAttendanceReminder('PUNCH_IN', reminderTime);
            results.push({ type: 'PUNCH_IN', time: `${hour}:${minute} IST`, result });
        }

        // PUNCH OUT reminders - 6:25 PM, 6:30 PM, 6:35 PM IST
        if (hour == 18 && [25, 30, 35].includes(minute)) {
            const timeStr = minute == 25 ? '6:25 PM' :
                minute == 30 ? '6:30 PM' : '6:35 PM';
            console.log(`📢 Sending PUNCH_OUT reminders (${timeStr} IST)`);
            const result = await sendAttendanceReminder('PUNCH_OUT', reminderTime);
            results.push({ type: 'PUNCH_OUT', time: `${hour}:${minute} IST`, result });
        }

        return {
            success: true,
            timestamp: now,
            istTimestamp: istTime,
            results
        };
    } catch (error) {
        console.error("❌ Error in scheduleReminders:", error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Send custom notification with forced sound
 */
const sendCustomNotification = async (token, title, body, data = {}, options = {}) => {
    return sendPushNotification({
        token,
        title,
        body,
        data,
        sound: options.sound || 'default',
        critical: options.critical || false,
    });
};

/**
 * Send notification to multiple devices
 */
const sendNotificationToMultiple = async (tokens, title, body, data = {}, options = {}) => {
    try {
        if (!tokens || tokens.length === 0) {
            throw new Error("At least one token is required");
        }

        // If more than 500 tokens, Firebase requires using sendEach or sendAll
        if (tokens.length > 500) {
            const messages = tokens.map(token => ({
                token,
                notification: { title, body },
                data: Object.fromEntries(
                    Object.entries(data).map(([key, value]) => [key, String(value)])
                ),
                android: {
                    priority: "high",
                    notification: {
                        sound: options.sound || 'default',
                        channelId: "attendance",
                    },
                },
                apns: {
                    headers: {
                        "apns-priority": "10",
                        "apns-push-type": "alert",
                    },
                    payload: {
                        aps: {
                            sound: options.sound || 'default',
                            alert: { title, body },
                            badge: 1,
                        },
                    },
                },
            }));

            const response = await admin.messaging().sendAll(messages);
            return {
                success: true,
                response,
                successCount: response.successCount,
                failureCount: response.failureCount,
            };
        }

        // For less than 500 tokens, send individually
        const results = await Promise.allSettled(
            tokens.map(token =>
                sendPushNotification({
                    token,
                    title,
                    body,
                    data,
                    sound: options.sound || 'default',
                    critical: options.critical || false,
                })
            )
        );

        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

        return {
            success: true,
            total: tokens.length,
            successful,
            failed,
            results,
        };
    } catch (error) {
        console.error("❌ Error sending to multiple devices:", error);
        return {
            success: false,
            error: error.message,
        };
    }
};

/**
 * Send notification to a specific employee
 */
const sendNotificationToEmployee = async (employeeId, title, body, data = {}, options = {}) => {
    try {
        const devices = await Device.find({
            employee: employeeId,
            fcmToken: {
                $exists: true,
                $ne: null,
            },
        });

        if (devices.length === 0) {
            return {
                success: false,
                message: "No devices found for this employee",
            };
        }

        const tokens = devices.map(d => d.fcmToken);
        return await sendNotificationToMultiple(tokens, title, body, data, options);
    } catch (error) {
        console.error("❌ Error sending notification to employee:", error);
        return {
            success: false,
            error: error.message,
        };
    }
};

/**
 * Manually trigger reminder for specific type
 */
const sendManualReminder = async (type) => {
    if (!isWorkingDay()) {
        return {
            success: false,
            message: "Today is a non-working day"
        };
    }
    return await sendAttendanceReminder(type);
};

module.exports = {
    sendPushNotification,
    sendAttendanceReminder,
    sendCustomNotification,
    sendNotificationToMultiple,
    sendNotificationToEmployee,
    getReminderMessages,
    getEmployeeName,
    isWorkingDay,
    scheduleReminders,
    sendManualReminder,
    hasEmployeePunchedIn,
    hasEmployeePunchedOut,
};