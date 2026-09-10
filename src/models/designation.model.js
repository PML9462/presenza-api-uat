const mongoose = require("mongoose");
const designationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    level: {
      type: Number, // optional (e.g. 1 = Junior, 2 = Senior)
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department" // optional mapping
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Designation", designationSchema);