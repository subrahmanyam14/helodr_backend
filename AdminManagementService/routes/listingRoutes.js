const express = require("express");
const router = express.Router();

// Import controllers
const listingPlanController = require("../controllers/listingPlanController");
const hospitalAdController = require("../controllers/hospitalAdvertisementController");
const topDoctorListingController = require("../controllers/topDoctorListingController");
const topHospitalListingController = require("../controllers/topHospitalListingController");
const advisoryBoardController = require("../controllers/advisoryBoardController");
const listingPaymentController = require('../controllers/listingPaymentController');

// Import middleware
const {protect, authorize} = require("../middleware/authMiddleware");

// Listing Plan Routes
router.post("/listing-plans", protect, authorize("admin", "superadmin"), listingPlanController.createListingPlan);
router.get("/listing-plans", listingPlanController.getAllListingPlans);
router.get("/listing-plans/:name", listingPlanController.getListingPlan);
router.put("/listing-plans/:id", protect, authorize("admin", "superadmin"), listingPlanController.updateListingPlan);
router.delete("/listing-plans/:id", protect, authorize("admin", "superadmin"), listingPlanController.deleteListingPlan);

// Hospital Advertisement Routes
router.post("/hospital-ads", protect, hospitalAdController.createHospitalAd);
router.get("/hospital-ads", protect, hospitalAdController.getAllHospitalAds);
router.get("/hospital-ads/:id", protect, hospitalAdController.getHospitalAd);
router.put("/hospital-ads/:id", protect, hospitalAdController.updateHospitalAd);
router.delete("/hospital-ads/:id", protect, hospitalAdController.deleteHospitalAd);
router.patch("/hospital-ads/:id/stats", hospitalAdController.updateStats);
router.get("/public/hospital-ads", hospitalAdController.getActiveHospitalAds);
// Top Doctor Listing Routes
router.post("/top-doctor-listings", protect, topDoctorListingController.createTopDoctorListing);
router.get("/top-doctor-listings", protect, topDoctorListingController.getAllTopDoctorListings);
router.get("/top-doctor-listings/:id", protect, topDoctorListingController.getTopDoctorListing);
router.put("/top-doctor-listings/:id", protect, topDoctorListingController.updateTopDoctorListing);
router.delete("/top-doctor-listings/:id", protect, topDoctorListingController.deleteTopDoctorListing);
router.get("/public/top-doctor-listings", topDoctorListingController.getActiveTopDoctorListings);

// Top Hospital Listing Routes
router.post("/top-hospital-listings", protect, topHospitalListingController.createTopHospitalListing);
router.get("/top-hospital-listings", protect, topHospitalListingController.getAllTopHospitalListings);
router.get("/top-hospital-listings/:id", protect, topHospitalListingController.getTopHospitalListing);
router.put("/top-hospital-listings/:id", protect, topHospitalListingController.updateTopHospitalListing);
router.delete("/top-hospital-listings/:id", protect, topHospitalListingController.deleteTopHospitalListing);
router.get("/public/top-hospital-listings", topHospitalListingController.getActiveTopHospitalListings);
router.get("/top-hospital-listings/check/:hospitalId", topHospitalListingController.checkHospitalListingStatus);

// Advisory Board Routes
router.post("/advisory-board", protect, authorize("admin", "superadmin"), advisoryBoardController.createAdvisoryBoardMember);
router.get("/advisory-board", advisoryBoardController.getAllAdvisoryBoardMembers);
router.get("/advisory-board/:id", advisoryBoardController.getAdvisoryBoardMember);
router.get("/advisory-board/doctor/:doctorId", advisoryBoardController.getAdvisoryBoardMemberByDoctor);
router.put("/advisory-board/:id", protect, authorize("admin", "superadmin"), advisoryBoardController.updateAdvisoryBoardMember);
router.delete("/advisory-board/:id", protect, authorize("admin", "superadmin"), advisoryBoardController.deleteAdvisoryBoardMember);
router.get("/public/advisory-board", advisoryBoardController.getActiveAdvisoryBoard);
router.patch("/advisory-board/reorder", protect, authorize("admin", "superadmin"), advisoryBoardController.reorderAdvisoryBoard);


// Protected routes
router.use(protect);

// User routes
router.post('/dummy-payment', listingPaymentController.createDummyPayment);
router.get('/my-payments', listingPaymentController.getMyPayments);
router.get('/:paymentId', listingPaymentController.getPaymentById);

// Admin only routes
router.post('/manual-payment', authorize('admin'), listingPaymentController.createManualPayment);
router.post('/free-listing', authorize('admin'), listingPaymentController.createFreeListing);
router.get('/admin/all-payments', authorize('admin'), listingPaymentController.getAllPayments);
router.get('/admin/user-payments/:userId', authorize('admin'), listingPaymentController.getPaymentsByUserId);
router.put('/admin/update-status/:paymentId', authorize('admin'), listingPaymentController.updatePaymentStatus);
// router.patch('/admin/refund/:paymentId', authorize('admin'), listingPaymentController.addRefund);
// router.get('/admin/statistics', authorize('admin'), listingPaymentController.getPaymentStatistics);

module.exports = router;