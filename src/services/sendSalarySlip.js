const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const FormData = require("form-data");

const API_KEY = "8f4d9c1a7e2b5f6d3a8c9e1f4b7d2a5c8e6f1a3d9b4c7e2f5a8d1c6b9e3f7a2"

const HMAC_SECRET = "4a9e7c2d8f1b6a3e5d9c7f2b4a8e1d6c3f9a5b7e2d4c8f1a6b3e9d7c2f5a8b1e4d6c9f2a7b5e3d8c1f4a6e9b2d7c5f8"

const fileBuffer = fs.readFileSync(
    "./payslip.pdf"
);

const fileHash = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex");

const timestamp = Math.floor(
    Date.now() / 1000
);

const payload = {
    employeeCode: "F1999",
    month: "07",
    year: "2026",
    timestamp,
    fileHash,
};

const signature = crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");

const formData = new FormData();

formData.append(
    "employeeCode",
    "F1999"
);

formData.append(
    "month",
    "07"
);

formData.append(
    "year",
    "2026"
);

formData.append(
    "file",
    fs.createReadStream(
        "./payslip.pdf"
    )
);

(async () => {
    try {

        const response =
            await axios.post(
                "https://api-presenza.paulmerchants.net/api/v1/admin/payroll/salary-slip",
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),

                        "x-api-key": API_KEY,

                        "x-timestamp":
                            timestamp,

                        "x-file-sha256":
                            fileHash,

                        "x-signature":
                            signature,
                    },
                }
            );

            console.log(response)

    } catch (error) {
        console.log(error)

    }
})();