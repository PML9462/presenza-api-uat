const express = require('express');
const router = express.Router();
const { kraController } = require('../../controllers/admin/index');
const auth = require('../../middlewares/admin/auth');

router.post('/batch', auth(), kraController.createKRA);
router.get('/', auth(), kraController.getAllKRA);
router.get('/batch/:batchId', auth(), kraController.getKRAbyBatchId);
router.delete('/:id', auth(), kraController.deleteKRA);
router.delete('/individual/:id', auth(), kraController.deleteIndividualKRA);
router.patch('/:id', auth(), kraController.updateIndividualKRA);

module.exports = router;