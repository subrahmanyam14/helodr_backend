const express = require("express");
const router = express.Router();
const { getDashboardOverview ,getLocationOverview,getAdminDoctors,getPendingDoctors,updateDoctorStatus,
    getDoctorPerformance,getPatients,getPatientDetails,getFinanceOverview,getFinanceTransactions, addAdmin, addSuperAdmin,
    getDashboardData} = require("../controllers/admincontroller");
const { protect, authorize } = require("../middleware/authMiddleware"); 
router.get("/dashboard/", getDashboardData);
router.get("/dashboard/overview", getDashboardOverview);
router.get("/dashboard/location-overview", getLocationOverview);
router.get("/doctors", getAdminDoctors);
router.get("/pendingdoctors",getPendingDoctors);
router.put('/doctors/:id/status', updateDoctorStatus);
router.get('/doctors/:id/performance', getDoctorPerformance);
router.get("/patients",getPatients);
router.get('/patients/:id',getPatientDetails);
router.get("/finance/overview", getFinanceOverview);
router.get("/finance/transactions", getFinanceTransactions);

router.post("/create-admin", protect, authorize("superadmin"), addAdmin);
router.post("/create-superadmin", protect, authorize("superadmin"), addSuperAdmin)
module.exports = router;
