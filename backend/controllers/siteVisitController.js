import SiteVisit from '../models/SiteVisit.js';
import Attendance from '../models/Attendance.js';
import SystemSetting from '../models/SystemSetting.js';
import moment from 'moment'; // Ensure moment is available or use native dates, I'll use native dates as much as possible, or moment if it's already in the project.

// Helper to get distance between two coords in meters
const getDistanceFromLatLonInM = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Radius of the earth in m
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in m
  return d;
};

// Create Site Visit Request
export const createSiteVisit = async (req, res) => {
  try {
    const newVisit = new SiteVisit(req.body);
    await newVisit.save();
    res.status(201).json({ success: true, siteVisit: newVisit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all Site Visits (Admin)
export const getSiteVisits = async (req, res) => {
  try {
    const { status, employeeId, startDate, endDate } = req.query;
    let query = {};
    if (status) query.status = status;
    if (employeeId) query.employeeId = employeeId;
    if (startDate && endDate) {
      query.startDate = { $gte: startDate };
      query.endDate = { $lte: endDate };
    }
    const visits = await SiteVisit.find(query).populate('employeeId', 'employeeId firstName lastName department designation profilePicture').sort({ createdAt: -1 });
    res.status(200).json({ success: true, siteVisits: visits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get active visits
export const getActiveVisits = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const activeVisits = await SiteVisit.find({ status: 'Active' })
      .populate('employeeId', 'employeeId firstName lastName profilePicture');
      
    // Filter out only those where today's record is checked in but not checked out
    const currentlyOnSite = activeVisits.filter(visit => {
      const todayRecord = visit.dailyRecords.find(r => r.date === today);
      return todayRecord && todayRecord.checkIn && !todayRecord.checkOut;
    });

    res.status(200).json({ success: true, activeVisits: currentlyOnSite });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single visit
export const getSiteVisitById = async (req, res) => {
  try {
    const visit = await SiteVisit.findById(req.params.id).populate('employeeId', 'employeeId firstName lastName department profilePicture');
    if (!visit) return res.status(404).json({ success: false, message: 'Not found' });
    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Approve
export const approveSiteVisit = async (req, res) => {
  try {
    const visit = await SiteVisit.findByIdAndUpdate(req.params.id, {
      status: 'Approved',
      approvedBy: req.body.adminId, // or from auth middleware
      approvedAt: new Date()
    }, { new: true });
    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Reject
export const rejectSiteVisit = async (req, res) => {
  try {
    const { rejectionReason, adminId } = req.body;
    const visit = await SiteVisit.findByIdAndUpdate(req.params.id, {
      status: 'Rejected',
      rejectionReason,
      approvedBy: adminId,
      approvedAt: new Date()
    }, { new: true });
    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Check In
export const checkInSiteVisit = async (req, res) => {
  try {
    const { lat, lng, address } = req.body;
    const visit = await SiteVisit.findById(req.params.id);
    if (!visit) return res.status(404).json({ success: false, message: 'Not found' });
    
    if (visit.status !== 'Approved' && visit.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Site visit must be approved first' });
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Check if already checked in today
    let todayRecord = visit.dailyRecords.find(r => r.date === today);
    if (todayRecord && todayRecord.checkIn) {
      return res.status(400).json({ success: false, message: 'Already checked in today' });
    }

    const distance = getDistanceFromLatLonInM(visit.latitude, visit.longitude, lat, lng);
    const isVerified = distance <= visit.geofenceRadius;

    if (!todayRecord) {
      todayRecord = {
        date: today,
        checkIn: new Date(),
        checkInLocation: { lat, lng, address },
        locationStatus: isVerified ? 'Verified' : 'Not Verified'
      };
      visit.dailyRecords.push(todayRecord);
    } else {
      todayRecord.checkIn = new Date();
      todayRecord.checkInLocation = { lat, lng, address };
      todayRecord.locationStatus = isVerified ? 'Verified' : 'Not Verified';
    }

    visit.status = 'Active';
    await visit.save();
    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Check Out
export const checkOutSiteVisit = async (req, res) => {
  try {
    const { lat, lng, address, workSummary } = req.body;
    const visit = await SiteVisit.findById(req.params.id);
    if (!visit) return res.status(404).json({ success: false, message: 'Not found' });

    const today = new Date().toISOString().split('T')[0];
    let todayRecord = visit.dailyRecords.find(r => r.date === today);

    if (!todayRecord || !todayRecord.checkIn) {
      return res.status(400).json({ success: false, message: 'Not checked in today' });
    }
    if (todayRecord.checkOut) {
      return res.status(400).json({ success: false, message: 'Already checked out today' });
    }

    const checkOutTime = new Date();
    todayRecord.checkOut = checkOutTime;
    todayRecord.checkOutLocation = { lat, lng, address };
    todayRecord.workSummary = workSummary;

    // Calculate duration
    const diffMs = checkOutTime - new Date(todayRecord.checkIn);
    const totalMins = Math.floor(diffMs / 60000);
    const totalHours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    
    todayRecord.totalHours = `${totalHours}h ${mins}m`;

    // Fetch settings for calculation
    const maxSetting = await SystemSetting.findOne({ key: 'site_visit_max_hours' });
    const maxHours = maxSetting ? parseFloat(maxSetting.value) : 8;
    
    if (totalMins > (maxHours * 60)) {
      const regMins = maxHours * 60;
      const otMins = totalMins - regMins;
      todayRecord.regularHours = `${Math.floor(regMins / 60)}h ${regMins % 60}m`;
      todayRecord.overtimeHours = `${Math.floor(otMins / 60)}h ${otMins % 60}m`;
      todayRecord.overtimeStatus = 'Pending';
    } else {
      todayRecord.regularHours = todayRecord.totalHours;
      todayRecord.overtimeHours = '0h 0m';
      todayRecord.overtimeStatus = 'Not Applicable';
    }

    // Check if visit is completed
    const endDate = new Date(visit.endDate).toISOString().split('T')[0];
    if (today >= endDate) {
      visit.status = 'Completed';
    }

    await visit.save();

    // Create or Update Attendance Record
    let attendance = await Attendance.findOne({ employeeId: visit.employeeId, date: today });
    if (!attendance) {
      attendance = new Attendance({
        employeeId: visit.employeeId,
        date: today,
        checkIn: todayRecord.checkIn,
        checkOut: todayRecord.checkOut,
        status: 'Site Visit',
        workStatus: 'Completed',
        workHours: todayRecord.totalHours,
        overtime: todayRecord.overtimeHours,
        location: { lat, lng }
      });
      await attendance.save();
    } else {
      attendance.status = 'Site Visit';
      attendance.checkIn = todayRecord.checkIn;
      attendance.checkOut = todayRecord.checkOut;
      attendance.workStatus = 'Completed';
      attendance.workHours = todayRecord.totalHours;
      attendance.overtime = todayRecord.overtimeHours;
      await attendance.save();
    }

    res.status(200).json({ success: true, siteVisit: visit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getEmployeeSiteVisits = async (req, res) => {
  try {
    const visits = await SiteVisit.find({ employeeId: req.params.employeeId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, siteVisits: visits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSiteVisitReports = async (req, res) => {
  try {
    // Basic aggregation for reports
    const visits = await SiteVisit.find().populate('employeeId', 'firstName lastName');
    // We can do advanced grouping in frontend or backend. Returning raw for frontend grouping.
    res.status(200).json({ success: true, siteVisits: visits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
