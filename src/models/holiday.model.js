const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
  {
    calendar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HolidayCalendar",
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    type: {
      type: String,
      enum: ["PUBLIC", "OPTIONAL"],
      default: "PUBLIC",
    },

    description: String,

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

holidaySchema.index({ calendar: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Holiday", holidaySchema);
