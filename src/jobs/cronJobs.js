const cron = require('node-cron');

const {
    autoPunchOutMissedEmployees
} = require('../services/cronAttendance.service');

const {
    scheduleReminders
} = require('../services/notification.service');

const IST = 'Asia/Kolkata';

const initCronJobs = () => {

    // ============================================
    // AUTO PUNCH OUT - 11:30 PM IST
    // ============================================

    cron.schedule('0 */2 * * *', async () => {
        try {
            console.log(
                `[${new Date().toISOString()}] Running auto punch-out cron`
            );

            await autoPunchOutMissedEmployees();

        } catch (error) {
            console.error('Auto punch-out cron failed:', error);
        }
    }, {
        timezone: IST
    });

    //     cron.schedule('* * * * *', async () => {
    //     try {
    //         console.log(
    //             `[${new Date().toISOString()}] Running auto punch-out cron`
    //         );

    //         await autoPunchOutMissedEmployees();

    //     } catch (error) {
    //         console.error('Auto punch-out cron failed:', error);
    //     }
    // }, {
    //     timezone: IST
    // });

    //     cron.schedule('* * * * *', async () => {
    //     try {
    //         console.log(
    //             `[${new Date().toISOString()}] Running auto punch-out cron`
    //         );

    //         await autoPunchOutMissedEmployees();

    //     } catch (error) {
    //         console.error('Auto punch-out cron failed:', error);
    //     }
    // }, {
    //     timezone: IST
    // });


    // ============================================
    // PUNCH IN REMINDERS - 9:25, 9:30, 9:35 AM IST
    // ============================================

    // 9:25 AM IST
    cron.schedule('25 9 * * *', async () => {
        try {
            console.log(
                `[${new Date().toISOString()}] Running PUNCH_IN reminder - 09:25 IST`
            );

            await scheduleReminders('PUNCH_IN');

        } catch (error) {
            console.error('09:25 PUNCH_IN reminder failed:', error);
        }
    }, {
        timezone: IST
    });


    // 9:30 AM IST
    cron.schedule('30 9 * * *', async () => {
        try {
            console.log(
                `[${new Date().toISOString()}] Running PUNCH_IN reminder - 09:30 IST`
            );

            await scheduleReminders('PUNCH_IN');

        } catch (error) {
            console.error('09:30 PUNCH_IN reminder failed:', error);
        }
    }, {
        timezone: IST
    });


    // 9:35 AM IST
    cron.schedule('35 9 * * *', async () => {
        try {
            console.log(
                `[${new Date().toISOString()}] Running PUNCH_IN reminder - 09:35 IST`
            );

            await scheduleReminders('PUNCH_IN');

        } catch (error) {
            console.error('09:35 PUNCH_IN reminder failed:', error);
        }
    }, {
        timezone: IST
    });


    // ============================================
    // PUNCH OUT REMINDERS - 6:25, 6:30, 6:35 PM IST
    // ============================================

    // 6:25 PM IST
    cron.schedule('25 18 * * *', async () => {
        try {
            console.log(
                `[${new Date().toISOString()}] Running PUNCH_OUT reminder - 18:25 IST`
            );

            await scheduleReminders('PUNCH_OUT');

        } catch (error) {
            console.error('18:25 PUNCH_OUT reminder failed:', error);
        }
    }, {
        timezone: IST
    });


    // 6:30 PM IST
    cron.schedule('30 18 * * *', async () => {
        try {
            console.log(
                `[${new Date().toISOString()}] Running PUNCH_OUT reminder - 18:30 IST`
            );

            await scheduleReminders('PUNCH_OUT');

        } catch (error) {
            console.error('18:30 PUNCH_OUT reminder failed:', error);
        }
    }, {
        timezone: IST
    });


    // 6:35 PM IST
    cron.schedule('35 18 * * *', async () => {
        try {
            console.log(
                `[${new Date().toISOString()}] Running PUNCH_OUT reminder - 18:35 IST`
            );

            await scheduleReminders('PUNCH_OUT');

        } catch (error) {
            console.error('18:35 PUNCH_OUT reminder failed:', error);
        }
    }, {
        timezone: IST
    });




    console.log(
        `✅ Attendance cron jobs initialized with timezone: ${IST}`
    );
    console.log(`📋 Schedule Summary:
    - Auto Punch Out: 11:30 PM IST
    - Punch In Reminders: 9:25 AM, 9:30 AM, 9:35 AM IST
    - Punch Out Reminders: 6:25 PM, 6:30 PM, 6:35 PM IST
    `);
};

module.exports = {
    initCronJobs
};