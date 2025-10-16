const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const User = require('../models/User');

/**
 * Get count of doctors verified by the admin
 * GET /admin/metrics/doctors/count
 */
exports.getDoctorsCount = async (req, res) => {
  try {
    const adminId = req.user._id; // Assuming admin is authenticated
    
    // Find hospitals verified by this admin
    const hospitals = await Hospital.find({ 
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    }).select('_id');
    
    const hospitalIds = hospitals.map(h => h._id);
    
    // Count doctors affiliated with these hospitals
    const count = await Doctor.countDocuments({
      'hospitalAffiliations.hospital': { $in: hospitalIds },
      isActive: true
    });
    
    res.status(200).json({ count });
  } catch (error) {
    console.error('Error fetching doctors count:', error);
    res.status(500).json({ error: 'Failed to fetch doctors count' });
  }
};

/**
 * Get count of hospitals verified by the admin
 * GET /admin/metrics/hospitals/count
 */
exports.getHospitalsCount = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    const count = await Hospital.countDocuments({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    });
    
    res.status(200).json({ count });
  } catch (error) {
    console.error('Error fetching hospitals count:', error);
    res.status(500).json({ error: 'Failed to fetch hospitals count' });
  }
};

/**
 * Get revenue metrics for appointments in admin's hospitals
 * GET /admin/metrics/revenue?range=weekly|monthly|yearly
 */
exports.getRevenueMetrics = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { range = 'weekly' } = req.query;
    
    // Find hospitals verified by this admin
    const hospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    }).select('_id');
    
    const hospitalIds = hospitals.map(h => h._id);
    
    // Find doctors affiliated with these hospitals
    const doctors = await Doctor.find({
      'hospitalAffiliations.hospital': { $in: hospitalIds }
    }).select('_id');
    
    const doctorIds = doctors.map(d => d._id);
    
    // Calculate date range
    const now = new Date();
    let startDate, buckets, labelFormat;
    
    if (range === 'weekly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      buckets = 7;
      labelFormat = { weekday: 'short' };
    } else if (range === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      buckets = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      labelFormat = 'day';
    } else {
      // yearly
      startDate = new Date(now.getFullYear(), 0, 1);
      buckets = 12;
      labelFormat = { month: 'short' };
    }
    
    // Fetch payments
    const payments = await Payment.find({
      doctor: { $in: doctorIds },
      status: 'captured',
      createdAt: { $gte: startDate }
    }).select('amount createdAt');
    
    // Build buckets
    const bucketsArray = [];
    let total = 0;
    
    if (range === 'weekly') {
      for (let i = 0; i < buckets; i++) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
        const label = date.toLocaleDateString('en-IN', labelFormat);
        const amount = payments
          .filter(p => new Date(p.createdAt).toDateString() === date.toDateString())
          .reduce((sum, p) => sum + p.amount, 0);
        
        bucketsArray.push({ label, amount });
        total += amount;
      }
    } else if (range === 'monthly') {
      for (let i = 1; i <= buckets; i++) {
        const date = new Date(now.getFullYear(), now.getMonth(), i);
        const label = `${i}`;
        const amount = payments
          .filter(p => {
            const pDate = new Date(p.createdAt);
            return pDate.getDate() === i && pDate.getMonth() === now.getMonth();
          })
          .reduce((sum, p) => sum + p.amount, 0);
        
        bucketsArray.push({ label, amount });
        total += amount;
      }
    } else {
      // yearly
      for (let i = 0; i < buckets; i++) {
        const date = new Date(now.getFullYear(), i, 1);
        const label = date.toLocaleDateString('en-IN', labelFormat);
        const amount = payments
          .filter(p => {
            const pDate = new Date(p.createdAt);
            return pDate.getMonth() === i && pDate.getFullYear() === now.getFullYear();
          })
          .reduce((sum, p) => sum + p.amount, 0);
        
        bucketsArray.push({ label, amount });
        total += amount;
      }
    }
    
    res.status(200).json({ total, buckets: bucketsArray });
  } catch (error) {
    console.error('Error fetching revenue metrics:', error);
    res.status(500).json({ error: 'Failed to fetch revenue metrics' });
  }
};

/**
 * Get total appointments count
 * GET /admin/metrics/appointments/count?range=all|today
 */
exports.getAppointmentsCount = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { range = 'all' } = req.query;
    
    // Find hospitals and doctors under admin
    const hospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    }).select('_id');
    
    const hospitalIds = hospitals.map(h => h._id);
    
    const doctors = await Doctor.find({
      'hospitalAffiliations.hospital': { $in: hospitalIds }
    }).select('_id');
    
    const doctorIds = doctors.map(d => d._id);
    
    let query = { doctor: { $in: doctorIds } };
    
    if (range === 'today') {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      
      query.date = { $gte: startOfDay, $lt: endOfDay };
      
      // Get status breakdown for today
      const appointments = await Appointment.find(query).select('status');
      const byStatus = appointments.reduce((acc, apt) => {
        acc[apt.status] = (acc[apt.status] || 0) + 1;
        return acc;
      }, {});
      
      const completed = byStatus.completed || 0;
      const total = appointments.length;
      
      return res.status(200).json({ total, completed, byStatus });
    }
    
    const total = await Appointment.countDocuments(query);
    res.status(200).json({ total });
  } catch (error) {
    console.error('Error fetching appointments count:', error);
    res.status(500).json({ error: 'Failed to fetch appointments count' });
  }
};

/**
 * Get average rating for doctors under admin's hospitals
 * GET /admin/metrics/ratings/average
 */
exports.getAverageRating = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    const hospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    }).select('_id');
    
    const hospitalIds = hospitals.map(h => h._id);
    
    const doctors = await Doctor.find({
      'hospitalAffiliations.hospital': { $in: hospitalIds },
      isActive: true
    }).select('review');
    
    if (doctors.length === 0) {
      return res.status(200).json({ average: 0 });
    }
    
    const totalRating = doctors.reduce((sum, doc) => sum + (doc.review?.averageRating || 0), 0);
    const average = totalRating / doctors.length;
    
    res.status(200).json({ average: parseFloat(average.toFixed(2)) });
  } catch (error) {
    console.error('Error fetching average rating:', error);
    res.status(500).json({ error: 'Failed to fetch average rating' });
  }
};

/**
 * Get specialization distribution
 * GET /admin/charts/specializations
 */
exports.getSpecializationDistribution = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    const hospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    }).select('_id');
    
    const hospitalIds = hospitals.map(h => h._id);
    
    const doctors = await Doctor.find({
      'hospitalAffiliations.hospital': { $in: hospitalIds },
      isActive: true
    }).select('specializations');
    
    const specCounts = {};
    doctors.forEach(doc => {
      (doc.specializations || []).forEach(spec => {
        const normalized = spec.toLowerCase().replace(/\s+/g, '_');
        specCounts[normalized] = (specCounts[normalized] || 0) + 1;
      });
    });
    
    const distribution = Object.entries(specCounts).map(([name, count]) => ({
      name,
      count
    }));
    
    res.status(200).json({ distribution });
  } catch (error) {
    console.error('Error fetching specialization distribution:', error);
    res.status(500).json({ error: 'Failed to fetch specialization distribution' });
  }
};

/**
 * Get today's appointments with details
 * GET /admin/today-appointments
 */
exports.getTodayAppointments = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    const hospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    }).select('_id');
    
    const hospitalIds = hospitals.map(h => h._id);
    
    const doctors = await Doctor.find({
      'hospitalAffiliations.hospital': { $in: hospitalIds }
    }).select('_id');
    
    const doctorIds = doctors.map(d => d._id);
    
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    const appointments = await Appointment.find({
      doctor: { $in: doctorIds },
      date: { $gte: startOfDay, $lt: endOfDay }
    })
      .populate('patient', 'fullName')
      .populate({
        path: 'doctor',
        select: 'fullName specializations hospitalAffiliations',
        populate: {
          path: 'hospitalAffiliations.hospital',
          select: 'name'
        }
      })
      .sort({ 'slot.startTime': 1 });
    
    const formatted = appointments.map(apt => ({
      _id: apt._id,
      time: `${apt.slot?.startTime || ''}–${apt.slot?.endTime || ''}`,
      patient: apt.patient?.fullName || '',
      doctor: apt.doctor?.fullName || '',
      doctorSpecs: apt.doctor?.specializations || [],
      hospital: apt.doctor?.hospitalAffiliations?.[0]?.hospital?.name || '',
      status: apt.status,
      appointmentType: apt.appointmentType,
      reason: apt.reason || ''
    }));
    
    res.status(200).json(formatted);
  } catch (error) {
    console.error('Error fetching today appointments:', error);
    res.status(500).json({ error: 'Failed to fetch today appointments' });
  }
};

/**
 * Get top performing doctors (by completed appointments in last 30 days)
 * GET /admin/metrics/top-doctors
 */
exports.getTopDoctors = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    const hospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    }).select('_id');
    
    const hospitalIds = hospitals.map(h => h._id);
    
    const doctors = await Doctor.find({
      'hospitalAffiliations.hospital': { $in: hospitalIds },
      isActive: true
    }).select('_id fullName specializations review');
    
    const doctorIds = doctors.map(d => d._id);
    
    // Get appointments in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const appointments = await Appointment.find({
      doctor: { $in: doctorIds },
      status: 'completed',
      date: { $gte: thirtyDaysAgo }
    }).select('doctor');
    
    // Count completed appointments per doctor
    const completedCounts = appointments.reduce((acc, apt) => {
      const docId = apt.doctor.toString();
      acc[docId] = (acc[docId] || 0) + 1;
      return acc;
    }, {});
    
    // Build top doctors array
    const topDoctors = doctors.map(doc => ({
      doctorId: doc._id,
      name: doc.fullName,
      specializations: doc.specializations,
      avgRating: doc.review?.averageRating || 0,
      completed30d: completedCounts[doc._id.toString()] || 0
    }))
      .sort((a, b) => b.completed30d - a.completed30d)
      .slice(0, 5);
    
    res.status(200).json(topDoctors);
  } catch (error) {
    console.error('Error fetching top doctors:', error);
    res.status(500).json({ error: 'Failed to fetch top doctors' });
  }
};

module.exports = exports;