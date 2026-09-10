const sendEmail = require("../utils/sendMail");

/**
 * Convert UTC date to IST formatted values
 */
const formatToIST = (date) => {
  const optionsDate = {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  };

  const optionsTime = {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };

  return {
    date: new Date(date).toLocaleDateString("en-IN", optionsDate),
    time: new Date(date).toLocaleTimeString("en-IN", optionsTime),
  };
};

/**
 * Send meeting invitation email
 */
const sendMeetingInviteEmail = async ({ attendeesEmails, meeting, organizerName }) => {
  try {
    const {
      title,
      description,
      startTime,
      endTime,
      location,
      meetingLink,
      type,
    } = meeting;

    // ✅ Convert UTC → IST
    const start = formatToIST(startTime);
    const end = formatToIST(endTime);

    const formattedDate = start.date;
    const formattedStartTime = start.time;
    const formattedEndTime = end.time;

    const subject = `Meeting Invitation: ${title}`;

    const text = `
Dear Team,

You have been invited to attend the following meeting:

Title        : ${title}
Description  : ${description || "N/A"}
Date         : ${formattedDate}
Time         : ${formattedStartTime} - ${formattedEndTime} (IST)
Mode         : ${type}
Location     : ${location || meetingLink || "N/A"}

Organized By : ${organizerName}

Kindly ensure your availability and be present on time.

Best regards,  
${organizerName}
    `;

    const html = `
      <div style="font-family: Arial, sans-serif; background-color: #f4f6f8; padding: 20px;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e0e0e0;">
          
          <h2 style="margin-top: 0; color: #333;">📅 Meeting Invitation</h2>
          
          <p style="color: #555;">
            You have been invited to attend a meeting. Please find the details below:
          </p>

          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr>
              <td style="padding: 8px; font-weight: bold;">Title</td>
              <td style="padding: 8px;">${title}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Description</td>
              <td style="padding: 8px;">${description || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Date</td>
              <td style="padding: 8px;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Time</td>
              <td style="padding: 8px;">${formattedStartTime} - ${formattedEndTime} (IST)</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Mode</td>
              <td style="padding: 8px;">${type}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Location</td>
              <td style="padding: 8px;">${location || meetingLink || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Organizer</td>
              <td style="padding: 8px;">${organizerName}</td>
            </tr>
          </table>

          <p style="margin-top: 20px; color: #555;">
            Kindly ensure your availability and join the meeting on time.
          </p>

          <hr style="margin: 20px 0;" />

          <p style="font-size: 12px; color: #999;">
            This is an automated notification from your HRMS system.
          </p>
        </div>
      </div>
    `;

    // Send to all attendees
    await sendEmail(attendeesEmails.join(","), subject, text, html);

  } catch (error) {
    console.error("❌ Meeting email failed:", error.message);
  }
};

module.exports = {
  sendMeetingInviteEmail,
};