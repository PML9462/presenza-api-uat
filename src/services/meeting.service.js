const { Meeting, Employee } = require("../models/index");
const mongoose = require("mongoose");
const { sendMeetingInviteEmail } = require("./meeting.email");


const createMeeting = async (payload) => {
    const {
        title,
        description,
        type,
        date,
        startTime,
        endTime,
        location,
        meetingLink,
        attendees,
        reminders,
        recurring,
        organizer,
    } = payload;

    if (!title || !startTime || !endTime || !attendees?.length) {
        throw new Error("Missing required fields");
    }

    if (new Date(startTime) >= new Date(endTime)) {
        throw new Error("End time must be greater than start time");
    }

    // All users involved in new meeting
    const participants = [organizer, ...attendees];

    const conflict = await Meeting.findOne({
        isCancelled: false,

        // Any participant already busy
        $or: [
            { organizer: { $in: participants } },
            { "attendees.employeeId": { $in: participants } }
        ],

        // Time overlap
        startTime: { $lt: new Date(endTime) },
        endTime: { $gt: new Date(startTime) }
    });

    // // 🔴 Conflict Detection
    // const conflict = await Meeting.findOne({
    //     isCancelled: false,
    //     $or: [
    //         { organizer },
    //         { "attendees.employeeId": { $in: attendees } }
    //     ],
    //     $and: [
    //         { startTime: { $lt: new Date(endTime) } },
    //         { endTime: { $gt: new Date(startTime) } }
    //     ]
    // });

    if (conflict) {
        throw new Error("Meeting time conflicts with another meeting");
    }

    // ✅ Format attendees
    const formattedAttendees = attendees.map((userId) => ({
        employeeId: new mongoose.Types.ObjectId(userId),
        status: "PENDING",
    }));

    // ✅ Format reminders
    const formattedReminders = (reminders || []).map((min) => ({
        minutesBefore: min,
    }));

    // ✅ Create meeting
    const meeting = await Meeting.create({
        title,
        description,
        type,
        date,
        startTime,
        endTime,
        location,
        meetingLink,
        organizer,
        attendees: formattedAttendees,
        reminders: formattedReminders,
        recurring,
    });

    // =========================
    // 📧 SEND EMAIL INVITES
    // =========================
    try {
        // Get attendee emails
        const employees = await Employee.find(
            { _id: { $in: attendees } },
            { email: 1, name: 1 }
        );

        const attendeesEmails = employees.map((emp) => emp.email);

        const organizerData = await Employee.findOne({ _id: organizer });


        await sendMeetingInviteEmail({
            attendeesEmails,
            meeting,
            organizerName: organizerData?.fullName || "Organizer",
        });

    } catch (emailError) {
        console.error("Email sending failed (non-blocking):", emailError.message);
    }

    return meeting;
};


// const getMeetings = async ({ filter = {}, userId }) => {
//     const query = {
//         isCancelled: false,

//         // ✅ Show meetings where user is organizer OR attendee
//         ...(userId && {
//             $or: [
//                 { organizer: userId },
//                 { "attendees.employeeId": userId },
//             ],
//         }),

//         ...filter,
//     };

//     const meetings = await Meeting.find(query)
//         .populate({
//             path: "organizer",
//             select: "fullName email",
//         })
//         .populate({
//             path: "attendees.employeeId",
//             select: "fullName email",
//         })
//         .sort({ startTime: -1 })
//         .lean();

//     // ✅ Clean response (important for frontend)
//     const formattedMeetings = meetings.map((meeting) => ({
//         _id: meeting._id,
//         title: meeting.title,
//         description: meeting.description,
//         type: meeting.type,
//         date: meeting.date,
//         startTime: meeting.startTime,
//         endTime: meeting.endTime,
//         duration: meeting.duration,
//         location: meeting.location,
//         meetingLink: meeting.meetingLink,
//         status: meeting.status,

//         // ✅ Organizer
//         organizer: {
//             _id: meeting.organizer?._id,
//             fullName: meeting.organizer?.fullName,
//             email: meeting.organizer?.email,
//         },

//         // ✅ Attendees
//         attendees: meeting.attendees.map((att) => ({
//             _id: att.employeeId?._id,
//             fullName: att.employeeId?.fullName,
//             email: att.employeeId?.email,
//             status: att.status,
//             responseTime: att.responseTime,
//         })),

//         reminders: meeting.reminders,
//         createdAt: meeting.createdAt,
//     }));

//     return formattedMeetings;
// };


const getMeetings = async ({ filter = {}, userId }) => {

    const now = new Date();

    const query = {
        isCancelled: false,

        // ✅ Only upcoming meetings
        startTime: { $gte: now },

        // ✅ Organizer OR Attendee
        ...(userId && {
            $or: [
                { organizer: userId },
                { "attendees.employeeId": userId },
            ],
        }),

        ...filter,
    };


    const meetings = await Meeting.find(query)
        .populate({
            path: "organizer",
            select: "fullName email",
        })
        .populate({
            path: "attendees.employeeId",
            select: "fullName email",
        })
        .sort({ startTime: 1 }) // ✅ ascending for upcoming
        .lean();

    const formattedMeetings = meetings.map((meeting) => ({
        _id: meeting._id,
        title: meeting.title,
        description: meeting.description,
        type: meeting.type,
        date: meeting.date,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        duration: meeting.duration,
        location: meeting.location,
        meetingLink: meeting.meetingLink,
        status: meeting.status,

        organizer: {
            _id: meeting.organizer?._id,
            fullName: meeting.organizer?.fullName,
            email: meeting.organizer?.email,
        },

        attendees: meeting.attendees.map((att) => ({
            _id: att.employeeId?._id,
            fullName: att.employeeId?.fullName,
            email: att.employeeId?.email,
            status: att.status,
            responseTime: att.responseTime,
        })),

        reminders: meeting.reminders,
        createdAt: meeting.createdAt,
    }));

    return formattedMeetings;
};

module.exports = {
    createMeeting,
    getMeetings,
}