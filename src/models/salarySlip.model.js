// models/salarySlip.model.js

const mongoose =
    require("mongoose");

const schema =
    new mongoose.Schema(
        {
            employeeId: {
                type:
                    mongoose.Schema.Types.ObjectId,
                ref: "Employee",
                required: true,
            },

            employeeCode: {
                type: String,
                required: true,
            },

            payrollMonth: {
                type: Number,
                required: true,
            },

            payrollYear: {
                type: Number,
                required: true,
            },

            fileName: String,

            fileSize: Number,

            checksum: String,

            s3Bucket: String,

            s3Key: String,
        },
        {
            timestamps: true,
        }
    );

schema.index(
    {
        employeeId: 1,
        payrollMonth: 1,
        payrollYear: 1,
    },
    {
        unique: true,
    }
);

module.exports =
    mongoose.model(
        "SalarySlip",
        schema
    );