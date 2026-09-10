const AWS = require("aws-sdk");
const axios = require("axios");

// 10446
// accessKeyId: "Z3542T41YU7EPAMYDGAF",
// secretAccessKey: "kCoMf2BGjzzzluqmPg90PIf5Xo1VJi4rrnuXDR/t",
// region: "IN-NorthAZ1-SouthAZ1",
// ⚠️ Move to ENV in production
const s3 = new AWS.S3({
  accessKeyId: "JKC2M6KV5QU5F88N56KX",
  secretAccessKey: "BrhjSbWM25Yggv0bWikKSf3q6BBv8xQ5/MA3+ydv",
  endpoint: "https://north-az1-s3.cloud.airtel.in:10446",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
  region: "us-east-1",
});

const bucketName = "pmt-fin-prod-stor-bkt01";

/**
 * Upload JSON Data
 */
const uploadCustomerData = async (customerId, data) => {
  try {
    const key = `kyc/${customerId}/data.json`;

    const params = {
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    };
    const response = await s3.upload(params).promise();
    return response.Location;
  } catch (error) {
    console.error("❌ JSON Upload Error:", error.message);
    // console.log(error);
    throw error;
  }
};

/**
 * Download from URL and upload to S3
 */
const uploadFromUrl = async (fileUrl, key, contentType) => {
  try {
    const response = await axios.get(fileUrl, {
      responseType: "arraybuffer",
      timeout: 30000, // ⏱️ avoid hanging
    });

    const params = {
      Bucket: bucketName,
      Key: key,
      Body: response.data,
      ContentType: contentType || response.headers["content-type"],
    };

    const result = await s3.upload(params).promise();


    return result.Location;
  } catch (error) {
    console.error(`❌ Upload failed for ${key}:`, error.message);
    // console.log(error)
    throw error;
  }
};

module.exports = {
  uploadCustomerData,
  uploadFromUrl,
};