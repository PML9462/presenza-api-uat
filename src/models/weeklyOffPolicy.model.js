const mongoose = require("mongoose");

const weeklyOffPolicySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ["ALL_WEEKENDS", "CUSTOM", "NONE"],
      default: "CUSTOM",
    },

    customRules: [
      {
        day: {
          type: String,
          enum: [
            "SUNDAY",
            "MONDAY",
            "TUESDAY",
            "WEDNESDAY",
            "THURSDAY",
            "FRIDAY",
            "SATURDAY",
          ],
        },

        weekNumbers: [Number], // [2,4] for 2nd & 4th Saturday
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WeeklyOffPolicy", weeklyOffPolicySchema);
