const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

console.log(__dirname);
// Debug: Show where we're looking
const configPath = path.join(__dirname, "../../firebase.json");
console.log("Looking for firebase.json at:", configPath);
console.log("File exists?", fs.existsSync(configPath));

try {
    const serviceAccount = require(configPath);
    console.log("Service account loaded successfully", serviceAccount);
    console.log("Has cert? (private_key exists):", !!serviceAccount.private_key);
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase initialized successfully");
} catch (error) {
    console.log(error)
    console.error("Error loading firebase config:", error.message);
    console.error("Full error:", error);
    process.exit(1);
}

module.exports = admin;