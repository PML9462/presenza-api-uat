const express = require('express');
const router = express.Router();
const kraController = require('../controllers/kra.controller');
const auth = require('../middlewares/auth');

// All routes require authentication
router.use(auth());

// Employee viewing their own KRAs
router.get('/', kraController.getMyKRAs);
router.get('/:id', kraController.getMyKRAById);

// Employee updating their own KRA metrics (achieved values)
router.patch('/:id/metrics', kraController.updateMyKRAMetrics);

// Employee updating their own KRA status
router.patch('/:id/status', kraController.updateMyKRAStatus);

// Employee getting their KRA summary/dashboard
router.get('/dashboard', kraController.getKRADashboard);

module.exports = router;