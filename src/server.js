const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");
const app = require("./app");
const logger = require("./config/logger");
// const socketio = require("socket.io");
const { initCronJobs } = require('./jobs/cronJobs');

dotenv.config({ path: path.join(__dirname, "../.env") });

let server;

// Determine the environment and set the appropriate database URL
const isUat = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";


let dbUrl;

if (isUat) {
  dbUrl = process.env.MONGO_URI_UAT;
} else if (isProd) {
  dbUrl = process.env.MONGO_URI_PROD;
} else {
  throw new Error(
    "Unknown environment. Please set NODE_ENV to 'uat' or 'production'."
  );
}

// Connect to MongoDB
mongoose
  .connect("mongodb+srv://kamleshpaulmerchants:JEu2h9NlMAgzI2In@cluster0.8uoioi0.mongodb.net/presenza?retryWrites=true&w=majority", {
    compressors: ["snappy"],

    // ---- Added for connection-pool diagnosis / fix ----
    // Default maxPoolSize is 100; being explicit here so we know the real
    // ceiling instead of guessing. Raise this only after confirming (via
    // the checkout-failed listener below) that exhaustion is the actual
    // cause and that the app genuinely needs more concurrent connections
    // rather than the /api/v1/activities burst just holding onto too many
    // for too long.
    maxPoolSize: 100,
    minPoolSize: 10,

    // This is the important one: the driver's default waitQueueTimeoutMS
    // is 0, meaning an operation that can't get a connection waits FOREVER
    // with no error and no log line — which is exactly what produced the
    // silent 87-second hangs on Attendance.find. This makes it fail loudly
    // after 10s instead.
    waitQueueTimeoutMS: 10000,
  })
  .then(() => {
    logger.info("Connected to MongoDB");

    // ---- Pool visibility — logs when checkout actually fails ----
    // Attach once, right after connecting. Fires on the underlying
    // MongoClient, so it covers every query across the whole app.
    const client = mongoose.connection.getClient();

    client.on("connectionCheckOutFailed", (event) => {
      logger.error(`[mongo-pool] CHECKOUT FAILED — reason: ${event.reason}`);
    });

    client.on("connectionPoolCleared", (event) => {
      logger.warn(`[mongo-pool] pool cleared — serviceId: ${event.serviceId}`);
    });

    const server = app.listen(process.env.PORT, () => {
      console.log(`Listening to port ${process.env.PORT}`);
      // Initialize cron jobs
      initCronJobs();
    });
  })
  .catch((error) => {
    logger.error("Failed to connect to MongoDB", error);
    process.exit(1); // Exit the process with failure
  });