const express = require('express');
const router = express.Router();
const clusterController = require('../controllers/clusterController');

router.post('/', clusterController.createCluster);
router.get('/', clusterController.getAllClusters);
router.get('/:id', clusterController.getClusterByUserId);
router.put('/:id', clusterController.updateCluster);
router.delete('/:id', clusterController.deleteCluster);

module.exports = router;
