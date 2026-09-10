const httpStatus = require('http-status');
const { activityService, employeeService } = require('../services');
const getActivityData = (req, res) => {
    return res.status(httpStatus.status.OK).json({
        message: 'Recieved data successfully',
        data: req.body,
    });
}


const exportActivityData = async (req, res) => {
    // console.log(
    //     "Received activity data:",
    //     req.body.hostname,
    //     req.body.events.length
    // );

    try {
        const emp = await employeeService.getEmployeeByDeviceName(
            req.body.hostname
        );

        if (!emp) {
            return res.status(httpStatus.status.NOT_FOUND).json({
                message: "Employee not found",
            });
        }

        // Filter events within office hours (09:30 AM - 06:30 PM IST)
        const filteredEvents = (req.body.events || []).filter((event) => {
            const utcDate = new Date(event.timestamp);

            // Convert UTC to IST
            const istDate = new Date(
                utcDate.toLocaleString("en-US", {
                    timeZone: "Asia/Kolkata",
                })
            );

            const totalMinutes =
                istDate.getHours() * 60 + istDate.getMinutes();

            const officeStart = 9 * 60 + 30; // 09:30 AM
            const officeEnd = 18 * 60 + 30; // 06:30 PM

            return (
                totalMinutes >= officeStart &&
                totalMinutes <= officeEnd
            );
        });

        await activityService.exportActivityData(
            emp._id,
            filteredEvents
        );

        return res.status(httpStatus.status.OK).json({
            message: "Export initiated successfully",
            totalEvents: req.body.events.length,
            processedEvents: filteredEvents.length,
        });
    } catch (error) {
        console.error("Export Activity Error:", error);

        return res.status(httpStatus.status.INTERNAL_SERVER_ERROR).json({
            message: "Failed to export activity data",
            error: error.message,
        });
    }
};
// const exportActivityData = async (req, res) => {

//     console.log("Received activity data:", req.body.hostname, req.body.events.length);
//     try {

//         const emp = await employeeService.getEmployeeByDeviceName(req.body.hostname);

//         if (!emp) {
//             return res.status(httpStatus.status.NOT_FOUND).json({
//                 message: "Employee not found",
//             });
//         }

//         // Filter events within office hours (09:30 AM - 06:30 PM IST)
//         const filteredEvents = (req.body.events || []).filter((event) => {
//             const utcDate = new Date(event.timestamp);

//             // Convert UTC to IST
//             const istDate = new Date(
//                 utcDate.toLocaleString("en-US", {
//                     timeZone: "Asia/Kolkata",
//                 })
//             );

//             const totalMinutes =
//                 istDate.getHours() * 60 + istDate.getMinutes();

//             const officeStart = 9 * 60 + 30; // 09:30 AM
//             const officeEnd = 18 * 60 + 30;  // 06:30 PM

//             return totalMinutes >= officeStart && totalMinutes <= officeEnd;
//         });

//         await activityService.exportActivityData(emp._id, filteredEvents);

//         return res.status(httpStatus.status.OK).json({
//             message: "Export initiated successfully",
//             totalEvents: req.body.events.length,
//             processedEvents: filteredEvents.length,
//         });
//     } catch (error) {
//         console.error("Export Activity Error:", error);

//         return res.status(httpStatus.status.INTERNAL_SERVER_ERROR).json({
//             message: "Failed to export activity data",
//             error: error.message,
//         });
//     }
// };
module.exports = { getActivityData, exportActivityData }