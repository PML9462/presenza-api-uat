const mongoose = require("mongoose");

const rawDataSchema = new mongoose.Schema(
  {
    data: {
      type: mongoose.Schema.Types.Mixed,
    },
    error: {
      type: mongoose.Schema.Types.Mixed, // store error object/message
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("RawData", rawDataSchema);