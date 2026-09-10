const mongoose = require("mongoose");

const holidayCalendarSchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      required: true,
    },

    office: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Office",
      required: true,
    },

    name: {
      type: String,
      default: function () {
        return `Holiday Calendar ${this.year}`;
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

holidayCalendarSchema.index({ year: 1, office: 1 }, { unique: true });

module.exports = mongoose.model("HolidayCalendar", holidayCalendarSchema);
