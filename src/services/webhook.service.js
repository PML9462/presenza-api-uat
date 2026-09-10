const { RawData } = require("../models");
const crypto = require("crypto");
const { uploadCustomerData, uploadFromUrl } = require("../config/upload");

const SECRET_KEY = "5095b447dc2549debb97";

const decryptPayload = (encryptedData, secretKey) => {
  try {
    const hash = crypto.createHash("sha256").update(secretKey).digest();
    const key = hash.slice(0, 16);

    const encryptedBuffer = Buffer.from(encryptedData, "base64");

    if (encryptedBuffer.length < 28) {
      throw new Error("Invalid encrypted payload length");
    }

    const iv = encryptedBuffer.slice(0, 12);
    const cipherTextWithTag = encryptedBuffer.slice(12);

    const authTag = cipherTextWithTag.slice(-16);
    const cipherText = cipherTextWithTag.slice(0, -16);

    const decipher = crypto.createDecipheriv("aes-128-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherText, null, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("❌ Decryption failed:", err.message);
    return null;
  }
};

const recieveData = async (payload) => {
  let decryptedData = null;
  let jsonData = null;

  try {

    decryptedData = decryptPayload(payload, SECRET_KEY);

    if (!decryptedData) {
      throw new Error("Decryption returned null");
    }

    // jsonData = JSON.parse(decryptedData);
    jsonData = {
      "sessionDetails": {
        "extReferenceId": "C0402D1",
        "customerId": "93551",
        "creationDateTime": "2025-04-03T13:11:03.116834Z",
        "journeyId": "2",
        "kycStatus": {
          "status": "KYC Approved",
          "subStatus": "Approved by Auditor",
          "remarks": "",
          "updatedOn": "2025-04-03T13:15:34.075997Z"
        },
        "purgedStatus": "",
        "purgedOn": null,
        "purgingOn": "2025-04-23T13:11:28.466702Z",
        "attemptedNumber": 1
      },
      "systemMetaData": {
        "videoKycLink": "https://doodle-finance.videokyc.gridlines.io/?t=DTIsh5",
        "pdfReportUrl": "https://doodle-finance.s3.ap-south-1.amazonaws.com/X-Amz-Algorithm=AWS4-HMAC/xu40-p8i1-l8x3/78905698a1234562b6fba8.pdf?X-Amz-Algorithm=........it"
      },
      "kycDetails": {
        "customerPresence": "Odisha, India",
        "latitude": "20.3355468",
        "longitude": "85.8238207",

        "videoKycConsent": {
          "remarks": "I agree to the terms & conditions to complete the Video KYC",
          "status": "Agreed",
          "dateTime": "2025-04-03T13:14:45.477078Z"
        },

        "cameraPermission": {
          "status": "Yes",
          "dateTime": "2025-04-03T13:12:15.949693Z"
        },

        "locationPermission": {
          "status": "Yes",
          "dateTime": "2025-04-03T13:12:14.107673Z"
        },

        "microphonePermission": {
          "status": "Yes",
          "dateTime": "2025-04-03T13:12:16.441129Z"
        },

        "vpnStatus": "",

        "ipSpoofing": "",

        "kycDuration": "1 min 59 secs",

        "selectedLanguage": "English",

        "waitingTime": "3 mins 20 secs",

        "agentAllocation": {
          "method": "System driven"
        },

        "agentAction": {
          "status": "Verified",
          "agentId": "68851",
          "agentName": "Doodle Agent",
          "dateTime": "2025-04-03T13:15:34.075997Z",
          "remarks": "Testing remark by agent before approve."
        },

        "auditorAction": {
          "status": "APPROVED",
          "auditorId": "61901",
          "auditorName": "Doodle Admin",
          "dateTime": "2025-04-03T13:18:25.217306Z",
          "remarks": "Testing remark by auditor before approve."
        },

        "kycRecording": {
          "status": "Recorded",
          "recordingPath": "https://vkyc-video-dev-be.s3.ap-south-1.amazonaws.com/X-Amz-Algorithm=AWS4-HMAC/xu40-p8i1-l8x3/78905698a1234562b6fba8.mp4?X-Amz-Algorithm=........it",
          "recordingSize": "14427902"
        },

        "preCallPanPresenceCheck": {
          "capturedPanImageUrl": "s3-presign-url",
          "submittedPanNumber": "XXXXX0000X",
          "ocrDetails": {
            "panNumber": "XXXXX0000X",
            "name": "",
            "fathersName": "GAGANA BIHARI MAHAKHUDA",
            "dateOfBirth": ""
          },
          "status": "success",
          "dateTime": "2025-04-03T13:12:32.874495Z"
        },

        "ovdDetails": {
          "method": "aadhaarkyc",
          "aadhaarEkycConsent": "Yes",
          "name": "Bhupesh Mahakhuda",
          "dateOfBirth": "1998-01-08",
          "gender": "MALE",
          "mobileNumber": "b0c7af7090f83ca892e67049ecdd072a28a676fe0dc0389c6db975cbbcd9b87",
          "emailId": "11f55fecf5b33e1e5573b85e03dbf7aee9122ef127de52d65db880d017da81c",
          "address": "Plot No-49, Chandra Sekhar Pur S.O, Khordha, Orissa, 751016, India",
          "state": "Maharashtra",
          "city": "XXXXX",
          "pincode": "425412",
          "district": "XXXXX",
          "street": null,
          "locality": "NEAR DENA XXXX NANDURBAR",
          "ovdPhoto": "s3-presign-url",
          "dateTime": "2025-04-03T13:12:07.238557Z"
        },

        "liveness": {
          "method": "OTP_read",
          "otp": "5170",
          "agentStatus": "Verified",
          "agentRemarks": "",
          "dateTime": "2025-04-03T13:13:33.116922Z"
        },

        "panVerification": {
          "panImageUrl": "s3-presign-url",
          "submittedPanNumber": "XXXXX0000X",
          "ocrDetails": {
            "panNumber": "XXXXX0000X",
            "name": "",
            "fathersName": "GAGANA BIHARI MAHAKHUDA",
            "dateOfBirth": ""
          },
          "systemStatus": "success",
          "agentStatus": "Verified",
          "agentRemarks": "",
          "dateTime": "2025-04-03T13:14:17.904098Z"
        },

        "faceVerification": {
          "livePhotoImageUrl": "s3-presign-url",
          "ovdPhotoImageUrl": "s3-presign-url",
          "panPhotoImageUrl": "s3-presign-url",
          "ovdFaceMatch": "success",
          "panFaceMatch": "failed",
          "ovdAndPanPhotoMatch": "failed",
          "liveness": "failed",
          "agentStatus": "Verified",
          "agentRemarks": "",
          "dateTime": "2025-04-03T13:14:33.993216Z"
        },

        "signatureVerification": {
          "signatureImageUrl": "s3-presign-url",
          "signatureMatchWithPanStatus": "",
          "agentStatus": "Declined",
          "agentRemarks": "Signature image unclear or out of focus",
          "dateTime": "2025-04-03T13:14:21.932662Z"
        },

        "currentAddressVerification": {
          "currentAddress": "plot-49, Bhubaneswar, Odisha, 751016, India",
          "liveLocation": "20.3355468,85.8238207",
          "presentAtCurrentAddress": "No",
          "presentSameCity": "Yes",
          "presentSameLocality": "No",
          "presentSamePinCode": "No",
          "agentStatus": "Declined",
          "agentRemarks": "Customer's live location does not correspond to the address provided",
          "dateTime": "2025-04-03T13:14:45.462599Z"
        },

        "additionalPhotos": {
          "agentStatus": "Verified",
          "agentRemarks": "",
          "dateTime": "2025-10-31 11:49:47+05:30",
          "photoSections": [
            {
              "id": 1,
              "label": "Business premises",
              "photoData": [
                {
                  "order": 1,
                  "s3PresignUrl": "s3-presign-url"
                },
                {
                  "order": 2,
                  "s3PresignUrl": "s3-presign-url"
                },
                {
                  "order": 3,
                  "s3PresignUrl": "s3-presign-url"
                },
                {
                  "order": 4,
                  "s3PresignUrl": "s3-presign-url"
                }
              ]
            },
            {
              "id": 2,
              "label": "Shopfront",
              "photoData": [
                {
                  "order": 5,
                  "s3PresignUrl": "s3-presign-url"
                },
                {
                  "order": 6,
                  "s3PresignUrl": "s3-presign-url"
                },
                {
                  "order": 7,
                  "s3PresignUrl": "s3-presign-url"
                }
              ]
            },
            {
              "id": 3,
              "label": "Signboard",
              "photoData": [
                {
                  "order": 8,
                  "s3PresignUrl": "s3-presign-url"
                },
                {
                  "order": 9,
                  "s3PresignUrl": "s3-presign-url"
                }
              ]
            },
            {
              "id": 4,
              "label": "Any other photo",
              "photoData": [
                {
                  "order": 10,
                  "s3PresignUrl": "s3-presign-url"
                }
              ]
            }
          ]
        },

        "additionalDetails": {
          "question1": {
            "answerStatus": "not updated",
            "previousAnswer": "Yes",
            "newAnswer": "Yes"
          },
          "question2": {
            "answerStatus": "updated",
            "previousAnswer": "",
            "newAnswer": "3 April 1998"
          },
          "question3": {
            "answerStatus": "not updated",
            "previousAnswer": "4",
            "newAnswer": "4"
          },
          "question4": {
            "answerStatus": "not updated",
            "previousAnswer": "text",
            "newAnswer": "text"
          },
          "question5": {
            "answerStatus": "updated",
            "previousAnswer": "",
            "newAnswer": "Doctor"
          }
        }
      }
    }
    console.log("✅ Decrypted JSON Data:", jsonData);

    const customerId = jsonData?.sessionDetails?.customerId;
    const kycStatus = jsonData?.sessionDetails?.kycStatus?.status;
    const auditorStatus = jsonData?.kycDetails?.auditorAction?.status;

    // Save raw data
    await RawData.create({
      data: jsonData,
      error: null,
    });

    // =========================
    // ✅ UPDATED CONDITION
    // =========================
    const isKycApproved =
      // (
      //   kycStatus === "KYC Completed" ||   // backward support
      //   kycStatus === "KYC Approved"
      // ) &&
      auditorStatus === "APPROVED";

    if (!isKycApproved) {
      return { message: "KYC not approved by auditor" };
    }

    if (!customerId) {
      throw new Error("CustomerId missing");
    }

    // =========================
    // 📌 Extract URLs
    // =========================

    const pdfUrl = jsonData?.systemMetaData?.pdfReportUrl;
    const videoUrl = jsonData?.kycDetails?.kycRecording?.recordingPath;

    const faceImageUrl =
      jsonData?.kycDetails?.faceVerification?.livePhotoImageUrl;

    const aadhaarImageUrl =
      jsonData?.kycDetails?.ovdDetails?.ovdPhoto;

    const panImageUrl =
      jsonData?.kycDetails?.panVerification?.panImageUrl;


    // =========================
    // CORE FILES
    // =========================

    let pdfUpload = null;
    let videoUpload = null;

    if (pdfUrl) {
      try {
        pdfUpload = await uploadFromUrl(
          pdfUrl,
          `kyc/${customerId}/report.pdf`,
          "application/pdf"
        );
      } catch (err) {
        console.error("❌ PDF Upload Error:", err.message);
      }
    }

    if (videoUrl) {
      try {
        videoUpload = await uploadFromUrl(
          videoUrl,
          `kyc/${customerId}/video.mp4`,
          "video/mp4"
        );
      } catch (err) {
        console.error("❌ Video Upload Error:", err.message);
      }
    }

    // =========================
    // OPTIONAL IMAGES
    // =========================

    let faceUpload = null;
    let aadhaarUpload = null;
    let panUpload = null;

    if (faceImageUrl) {
      try {
        faceUpload = await uploadFromUrl(
          faceImageUrl,
          `kyc/${customerId}/face.jpg`,
          "image/jpeg"
        );
      } catch (err) {
        console.error("❌ Face Upload Error:", err.message);
      }
    }

    if (aadhaarImageUrl) {
      try {
        aadhaarUpload = await uploadFromUrl(
          aadhaarImageUrl,
          `kyc/${customerId}/aadhaar.jpg`,
          "image/jpeg"
        );
      } catch (err) {
        console.error("❌ Aadhaar Upload Error:", err.message);
      }
    }

    if (panImageUrl) {
      try {
        panUpload = await uploadFromUrl(
          panImageUrl,
          `kyc/${customerId}/pan.jpg`,
          "image/jpeg"
        );
      } catch (err) {
        console.error("❌ PAN Upload Error:", err.message);
      }
    }

    // =========================
    // SAVE JSON
    // =========================

    let jsonUpload = null;
    try {
      jsonUpload = await uploadCustomerData(customerId, jsonData);
    } catch (err) {
      console.error("❌ JSON Upload Error under webhook service:", err);
    }

    return {
      message: "✅ KYC Approved & Processed",
      pdf: pdfUpload,
      video: videoUpload,
      face: faceUpload,
      aadhaar: aadhaarUpload,
      pan: panUpload,
      json: jsonUpload,
    };

  } catch (err) {

    await RawData.create({
      data: jsonData,
      error: {
        message: err.message,
        stack: err.stack,
      },
    });

    throw err;
  }
};

module.exports = {
  recieveData,
};