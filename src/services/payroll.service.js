const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");

const Employee = require("../models/employee.model");
const SalarySlip = require("../models/salarySlip.model");

// const s3Client = require("../config/s3"); // adjust path

exports.uploadSalarySlip = async (req) => {

    const {
        employeeCode,
        month,
        year,
    } = req.body;

    //--------------------------------
    // Uploaded File
    //--------------------------------


    

    // //--------------------------------
    // // Generate S3 Key
    // //--------------------------------

    // const fileExtension =
    //     file.originalname.split(".").pop();

    // const s3Key =
    //     `salary-slips/${employeeCode}/${year}/${month}/${uuidv4()}.${fileExtension}`;

    // //--------------------------------
    // // Upload to S3
    // //--------------------------------

    // await s3Client.send(
    //     new PutObjectCommand({
    //         Bucket: process.env.AWS_BUCKET_NAME,

    //         Key: s3Key,

    //         Body: file.buffer,

    //         ContentType: file.mimetype,
    //     })
    // );

    //--------------------------------
    // Save Mongo
    //--------------------------------


    const employee = await Employee.findOne({
        employeeCode,
    });
    console.log(req.fileUrls)
    const salarySlip =
        await SalarySlip.findOneAndUpdate(
            {
                employeeId: employee._id,
                payrollMonth: Number(month),
                payrollYear: Number(year),
            },
            {
                employeeId: employee._id,

                employeeCode,

                payrollMonth: Number(month),

                payrollYear: Number(year),

                s3Bucket:req.fileUrls.file,

                // fileName: file?.originalname,

                // fileSize: file?.size,

                checksum: req?.fileChecksum,

                // s3Bucket:
                //     process.env.AWS_BUCKET_NAME,

                s3Key:"salary-slips/${employeeCode}/${year}/${month}/${uuidv4()}.${file.originalname.split('.').pop()}",

                uploadedAt: new Date(),
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            }
        );

    return salarySlip;
};