// middlewares/payrollWebhook.middleware.js

const crypto = require("crypto");

module.exports = async (req, res, next) => {
    try {


        //------------------------------------
        // 1. HTTPS Validation
        //------------------------------------

        const protocol =
            req.headers["x-forwarded-proto"] ||
            req.protocol;

        console.log("Request Protocol:", protocol);
        if (protocol !== "https") {
            return res.status(403).json({
                success: false,
                message: "HTTPS required",
            });
        }


        //------------------------------------
        // Extract Uploaded File
        //------------------------------------

        const uploadedFile = req.files?.file?.[0];

        //------------------------------------
        // 1. API KEY
        //------------------------------------

        const apiKey = req.headers["x-api-key"];

        if (apiKey !== process.env.PAYROLL_API_KEY) {
            return res.status(401).json({
                success: false,
                message: "Invalid API key",
            });
        }

        //------------------------------------
        // 2. Timestamp
        //------------------------------------

        const timestamp = Number(
            req.headers["x-timestamp"]
        );

        if (!timestamp) {
            return res.status(401).json({
                success: false,
                message: "Timestamp missing",
            });
        }

        const now = Math.floor(Date.now() / 1000);

        if (Math.abs(now - timestamp) > 300) {
            return res.status(401).json({
                success: false,
                message: "Request expired",
            });
        }

        //------------------------------------
        // 3. File Validation
        //------------------------------------

        if (!uploadedFile) {
            return res.status(400).json({
                success: false,
                message: "Salary slip PDF is required",
            });
        }

        if (
            uploadedFile.mimetype !==
            "application/pdf"
        ) {
            return res.status(400).json({
                success: false,
                message: "Only PDF files are allowed",
            });
        }

        //------------------------------------
        // 4. SHA256 Validation
        //------------------------------------

        const calculatedHash = crypto
            .createHash("sha256")
            .update(uploadedFile.buffer)
            .digest("hex");

        const receivedHash =
            req.headers["x-file-sha256"];

        if (!receivedHash) {
            return res.status(400).json({
                success: false,
                message: "x-file-sha256 header missing",
            });
        }

        if (calculatedHash !== receivedHash) {
            return res.status(400).json({
                success: false,
                message: "File integrity validation failed",
                expected: calculatedHash,
                received: receivedHash,
            });
        }

        //------------------------------------
        // 5. Signature Validation
        //------------------------------------

        const {
            employeeCode,
            month,
            year,
        } = req.body;

        const payload = JSON.stringify({
            employeeCode,
            month,
            year,
            timestamp,
            fileHash: receivedHash,
        });

        const expectedSignature = crypto
            .createHmac(
                "sha256",
                process.env.PAYROLL_HMAC_SECRET
            )
            .update(payload)
            .digest("hex");

        const receivedSignature =
            req.headers["x-signature"];

        if (!receivedSignature) {
            return res.status(400).json({
                success: false,
                message: "x-signature header missing",
            });
        }

        if (
            expectedSignature !==
            receivedSignature
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid signature",
                expected: expectedSignature,
                received: receivedSignature,
            });
        }

        //------------------------------------
        // Attach for Controller
        //------------------------------------

        req.uploadedFile = uploadedFile;
        req.fileChecksum = calculatedHash;

        next();

    } catch (error) {

        console.error("PAYROLL WEBHOOK ERROR");
        console.error(error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};