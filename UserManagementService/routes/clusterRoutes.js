const express = require('express');
const router = express.Router();
const clusterController = require('../controllers/clusterController');

router.post('/', clusterController.createCluster);
router.get('/', clusterController.getAllClusters);
router.get('/:id', clusterController.getClusterByUserId);
router.put('/:id', clusterController.updateCluster);
router.delete('/:id', clusterController.deleteCluster);
router.post('/clusters/:clusterId/hospitals/:hospitalId', clusterController.addHospitalToCluster);
router.delete('/clusters/:clusterId/hospitals/:hospitalId', clusterController.removeHospitalFromCluster);
router.get('/clusters/:clusterId/hospitals', clusterController.getHospitalsInCluster);
router.post('/clusters/:clusterId/auto-populate', clusterController.autoPopulateCluster);

module.exports = router;
