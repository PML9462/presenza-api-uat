const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      // index: true,
    },
    employeeCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    authStep: {
      type: String,
      enum: ["SEND_OTP", "VERIFY_OTP", "AUTHENTICATED"],
      default: "SEND_OTP",
    },

    role: {
      type: String,
      enum: ["CEO", "SUPER_ADMIN", "ADMIN", "HR", "EMPLOYEE", "MANAGER"],
      default: "EMPLOYEE",
    },

    password: {
      type: String,
    },

    // 👇 Reporting logic
    reportingTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      validate: {
        validator: function (value) {
          // CEO should NOT have reportingTo
          if (this.role === "CEO") return !value;

          // Others SHOULD have reportingTo
          return !!value;
        },
        message: "Invalid reporting structure based on role",
      },
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true
    },
    designation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Designation",
      required: true
    },
    office: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Office",
      required: true,
    },
    shiftPolicy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShiftPolicy",
      required: true,
    },
    weeklyOffPolicy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeeklyOffPolicy",
      required: true,
    },

    systemInfo: {
      isSystemProvided: { type: Boolean, default: false },
      systemType: {
        type: String,
        enum: ["LAPTOP", "DESKTOP"],
        required: function () {
          return this.systemInfo.isSystemProvided;
        }
      },
      operatingSystem: {
        type: String,
        enum: ["WINDOWS", "MAC_OS", "LINUX"],
        required: function () {
          return this.systemInfo.isSystemProvided;
        }
      },
      deviceName: { type: String, default: "" },
      brand: { type: String, default: "" },
      model: { type: String, default: "" },
      serialNumber: { type: String, default: "" },
      issuedAt: { type: Date, default: "" },
    },
    joiningDate: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: Date,
    refreshToken: String,

    lateCounts: [{
      month: { type: String, required: true },
      count: { type: Number, default: 0 }
    }],
    regularized: {
      type: Boolean,
      default: false,
    },

    regularizationRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceRegularization",
      default: null,
    },

    regularizedAt: {
      type: Date,
      default: null,
    },

    regularizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Employee", employeeSchema);