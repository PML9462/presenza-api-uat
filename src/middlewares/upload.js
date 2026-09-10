const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_BUCKET,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "packages",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [
      {
        width: 500, // Specify if resizing is needed
        height: 500, // Adjust or remove these if you want original size
        crop: "limit", // Keep original dimensions, but limit maximum size
        quality: "auto:best", // Adjusts quality to highest sensible level
        fetch_format: "auto", // Delivers best format for each browser/device
      },
    ],
  },
});

const multerMiddleware = multer({ storage: storage });

const uploadImage = (req, res, next) => {
  const upload = multerMiddleware.fields([
    { name: "image", maxCount: 1 },
    { name: "logo", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]);

  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res
        .status(400)
        .json({ error: "MulterError", message: err.message });
    } else if (err) {
      return res
        .status(500)
        .json({ error: "ServerError", message: "Something went wrong" });
    }
    next();
  });
};

module.exports = {
  uploadImage,
};
