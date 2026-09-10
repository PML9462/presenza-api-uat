const express = require('express');
const cors = require('cors');
const compression = require('compression');

const cookieParser = require('cookie-parser');
const httpStatus = require('http-status');

const morgan = require('./config/morgan');
const routes = require('./routes');
const adminRoutes = require('./routes/admin/index');
const webhookRoutes = require('./routes/webhook.route');

const ApiError = require('./utils/ApiError');
const { errorConverter, errorHandler } = require('./middlewares/error');

const app = express();

/* -------------------- Logger -------------------- */
app.use(morgan.successHandler);
app.use(morgan.errorHandler);

/* -------------------- Webhooks -------------------- */
// Keep webhook raw body handling before JSON parser
app.use(
  '/api/v1/webhooks',
  express.raw({ type: '*/*' })
);

app.use('/api/v1/webhooks', webhookRoutes);

/* -------------------- Response Compression -------------------- */
app.use(
  compression({
    level: 6, // Good balance between CPU and compression
    threshold: 1024, // Compress responses larger than 1 KB
  })
);

/* -------------------- Core Middlewares -------------------- */
app.use(
  express.json({
    limit: '25mb',
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

app.use(
  express.urlencoded({
    limit: '25mb',
    extended: true,
  })
);

app.use(cookieParser());

/* -------------------- CORS -------------------- */
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

/* -------------------- Health Check -------------------- */
app.get('/api/v1/health', (req, res) => {
  return res.status(200).send({
    status: 'ok',
    HttpStatusCode: 200,
    statusMessage: 'API is healthy!',
  });
});

app.get('/api/v1/test', (req, res) => {
  res.json({
    message: 'Test endpoint working!',
  });
});

/* -------------------- Routes -------------------- */
app.use('/api/v1', routes);
app.use('/api/v1/admin', adminRoutes);

/* -------------------- 404 Handler -------------------- */
app.use((req, res, next) => {
  next(
    new ApiError(
      httpStatus.status.NOT_FOUND,
      'Route not found'
    )
  );
});

/* -------------------- Error Handling -------------------- */
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;