const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid"); // For unique file names
require("dotenv").config();

// Multer configuration for multiple fields
const storage = multer.memoryStorage(); // Store files in memory (Buffer)
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/", "application/pdf"];

    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only image and PDF files are allowed!"), false);
    }
  },
}).fields([
  { name: "image", maxCount: 1 },
  { name: "logo", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
  { name: "banner", maxCount: 1 },
  { name: "file", maxCount: 1 }
]);

// AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Middleware to upload files to S3
const uploadToS3 = async (req, res, next) => {
  try {
    if (!req.files) {
      return res.status(400).send("No files uploaded");
    }

    const fileUrls = {};

    // Iterate over each field in the req.files object
    for (const fieldName in req.files) {
      const file = req.files[fieldName][0]; // Each field contains an array
      const fileExtension = file.originalname.split(".").pop();
      const fileName = `${uuidv4()}.${fileExtension}`;

      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read", // Make the file publicly accessible (optional)
      };

      const command = new PutObjectCommand(params);
      await s3Client.send(command);

      // Store the file URL in the fileUrls object
      fileUrls[
        fieldName
      ] = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    }

    // Attach the file URLs to the request object for later use
    req.fileUrls = fileUrls;
    console.log("Files uploaded to S3:", fileUrls);
    next();
  } catch (error) {
    console.log("Error uploading to S3:", error);
    next(error);
  }
};

module.exports = { upload, uploadToS3 };
