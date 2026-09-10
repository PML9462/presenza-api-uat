const moment = require("moment");

const getMinutesFromTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
};

const getTodayStart = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

const getWeekOfMonth = (date) => {
    const day = date.getDate();
    return Math.ceil(day / 7);
};

module.exports = {
    getMinutesFromTime,
    getTodayStart,
    getWeekOfMonth,
};
