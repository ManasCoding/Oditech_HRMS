import mongoose from 'mongoose';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Task from '../models/Task.js';
import SystemSetting from '../models/SystemSetting.js';
import Note from '../models/Note.js';
import Resignation from '../models/Resignation.js';

// Helper for distance calculation
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // in metres
};

export const getProfile = async (req, res) => {
  try {
    const isObjectId = req.params.id.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: req.params.id } : { empCode: req.params.id };
    const employee = await Employee.findOne(query).select('-password');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const allowedFields = ['fullName', 'phone', 'email', 'profileImage', 'password'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    
    const isObjectId = req.params.id.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: req.params.id } : { empCode: req.params.id };
    
    const employee = await Employee.findOneAndUpdate(query, updates, { new: true }).select('-password');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    const isObjectId = req.params.id.match(/^[0-9a-fA-F]{24}$/);
    const query = isObjectId ? { _id: req.params.id } : { empCode: req.params.id };

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const employee = await Employee.findOneAndUpdate(
      query,
      { profileImage: req.file.path },
      { new: true }
    ).select('-password');

    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    res.json({ success: true, profileImage: req.file.path, employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const tempUploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    res.json({ success: true, profileImage: req.file.path });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDirectory = async (req, res) => {
  try {
    const employees = await Employee.find({ status: 'Active' }).select('fullName empCode email phone department role profileImage joinDate').sort({ fullName: 1 });
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const checkIn = async (req, res) => {
  const { employeeId, lat, lng } = req.body;
  const now = new Date();
  
  // Get local date in YYYY-MM-DD format (Asia/Kolkata)
  const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(tzStr);
  
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  
  try {
    let attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance) {
      // Validate GPS Geofence
      if (lat && lng) {
        const settings = await SystemSetting.find({ key: { $in: ['office_lat', 'office_lng', 'geofence_radius'] } });
        const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: parseFloat(s.value) }), {});
        
        if (settingsMap.office_lat && settingsMap.office_lng && settingsMap.geofence_radius) {
          const distance = getDistance(lat, lng, settingsMap.office_lat, settingsMap.office_lng);
          if (distance > settingsMap.geofence_radius) {
            return res.json({ success: false, message: `Check-in failed: You are ${Math.round(distance)}m away from the office. Must be within ${settingsMap.geofence_radius}m.` });
          }
        }
      }

      // Get settings for late threshold (enforcing 10:00 AM as requested)
      const lateThreshold = '10:00';
      
      const currentTimeStr = localDate.getHours().toString().padStart(2, '0') + ':' + 
                             localDate.getMinutes().toString().padStart(2, '0');
      
      let status = 'Present';
      if (currentTimeStr >= '13:30') {
        status = 'Half Day';
      } else if (currentTimeStr > lateThreshold) {
        status = 'Late';
      }

      attendance = await Attendance.create({
        employeeId,
        date: today,
        checkIn: now,
        location: { lat, lng },
        status
      });
      return res.json({ success: true, attendance, alreadyCheckedIn: false });
    }
    
    // Already checked in. If they re-enter geofence, clear the lastExitTime.
    if (attendance.lastExitTime) {
      attendance.lastExitTime = null;
      await attendance.save();
    }
    
    return res.json({ success: true, attendance, alreadyCheckedIn: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const checkOut = async (req, res) => {
  const { employeeId } = req.body;
  const now = new Date();
  
  const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(tzStr);
  
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  
  try {
    let attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'No check-in record found for today.' });
    }
    
    // Calculate work hours
    const checkOutTime = now;
    if (attendance.checkIn) {
      const diffMs = checkOutTime - new Date(attendance.checkIn);
      const mins = Math.floor(diffMs / (1000 * 60));
      const workHours = `${Math.floor(mins / 60)}h ${mins % 60}m`;

      attendance.checkOut = checkOutTime;
      attendance.workHours = workHours;
      attendance.workStatus = 'Completed';
      attendance.lastExitTime = null; // Clear it just in case

      const checkOutTimeStr = localDate.getHours().toString().padStart(2, '0') + ':' + 
                              localDate.getMinutes().toString().padStart(2, '0');

      // Automatically mark as Half Day if worked less than 4 hours or checked out before 6:30 PM
      if ((Math.floor(mins / 60) < 4 || checkOutTimeStr < '18:30') && attendance.status !== 'Absent') {
        attendance.status = 'Half Day';
      }

      await attendance.save();
    }

    return res.json({ success: true, attendance, message: 'Checked out successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const markGeofenceExit = async (req, res) => {
  const { employeeId } = req.body;
  const now = new Date();
  
  const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const localDate = new Date(tzStr);
  
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  
  try {
    let attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'No check-in record found for today.' });
    }
    
    // Only set it if they haven't checked out
    if (!attendance.checkOut) {
      attendance.lastExitTime = now;
      await attendance.save();
      return res.json({ success: true, message: 'Geofence exit marked, 1-hour grace period started.' });
    }
    
    return res.json({ success: true, message: 'Already checked out.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTodayAttendance = async (req, res) => {
  try {
    const now = new Date();
    const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const localDate = new Date(tzStr);
    const today = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
    const attendance = await Attendance.findOne({ employeeId: req.params.employeeId, date: today });
    res.json({ success: true, attendance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStats = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year, period } = req.query; // period = 'month' | 'year'

    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? String(month).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');

    // Build date regex based on period
    const isYearly = period === 'year';
    const dateRegex = isYearly ? `^${targetYear}` : `^${targetYear}-${targetMonth}`;

    // Get settings for leave quotas
    const settings = await SystemSetting.find({ key: { $in: ['casual_leave', 'sick_leave'] } });
    const settingsMap = settings.reduce((acc, s) => ({ ...acc, [s.key]: parseFloat(s.value) }), {});
    const totalLeaveQuota = (settingsMap.casual_leave || 12) + (settingsMap.sick_leave || 10);

    // Present days — includes Late (Late = present but arrived after threshold)
    const presentDays = await Attendance.countDocuments({
      employeeId,
      date: { $regex: dateRegex },
      status: { $in: ['Present', 'Late'] }
    });

    // Half days in period
    const halfDays = await Attendance.countDocuments({
      employeeId,
      date: { $regex: dateRegex },
      status: 'Half Day'
    });

    // Working days in the period (Mon-Sat count, exclude Sundays)
    const startDate = isYearly ? new Date(`${targetYear}-01-01`) : new Date(`${targetYear}-${targetMonth}-01`);
    const endDate = isYearly ? new Date(`${targetYear}-12-31`) : new Date(targetYear, parseInt(targetMonth), 0);
    const effectiveEnd = endDate > now ? now : endDate;
    let workingDays = 0;
    const d = new Date(startDate);
    while (d <= effectiveEnd) {
      const day = d.getDay();
      if (day !== 0) workingDays++; // exclude Sundays (0), keep Monday-Saturday
      d.setDate(d.getDate() + 1);
    }

    // Leaves taken in period (approved leaves overlapping period)
    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const periodStart = formatDate(startDate);
    const periodEnd = formatDate(effectiveEnd);
    const empObjId = mongoose.Types.ObjectId.isValid(employeeId) ? new mongoose.Types.ObjectId(employeeId) : employeeId;
    const approvedLeaves = await LeaveRequest.find({
      employeeId: empObjId,
      status: 'APPROVED',
      fromDate: { $lte: periodEnd },
      toDate: { $gte: periodStart }
    });
    let leavesTaken = 0;
    for (const leave of approvedLeaves) {
      const lStart = new Date(Math.max(new Date(leave.fromDate), startDate));
      const lEnd = new Date(Math.min(new Date(leave.toDate), effectiveEnd));
      const diffDays = Math.round((lEnd - lStart) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 0) leavesTaken += diffDays;
    }
    // Pending leave requests
    const pendingLeavesResult = await LeaveRequest.aggregate([
      { 
        $match: { 
          employeeId: empObjId, 
          status: 'PENDING' 
        } 
      },
      { $group: { _id: null, totalDays: { $sum: '$days' } } }
    ]);
    const pendingLeaves = pendingLeavesResult.length > 0 ? pendingLeavesResult[0].totalDays : 0;

    // Rejected leave requests (all time - sum of days)
    const rejectedLeavesResult = await LeaveRequest.aggregate([
      { 
        $match: { 
          employeeId: empObjId, 
          status: 'REJECTED' 
        } 
      },
      { $group: { _id: null, totalDays: { $sum: '$days' } } }
    ]);
    const rejectedLeaves = rejectedLeavesResult.length > 0 ? rejectedLeavesResult[0].totalDays : 0;

    // Absent = working days - present - half days - leaves taken
    const absentDays = Math.max(0, workingDays - presentDays - halfDays - leavesTaken);

    // Available leaves = quota - total approved leave days this year
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;
    
    const approvedThisYearResult = await LeaveRequest.aggregate([
      { 
        $match: { 
          employeeId: empObjId,
          status: 'APPROVED',
          fromDate: { $lte: yearEnd },
          toDate: { $gte: yearStart }
        } 
      },
      { $group: { _id: null, totalDays: { $sum: '$days' } } }
    ]);
    
    const totalApprovedDaysThisYear = approvedThisYearResult.length > 0 ? approvedThisYearResult[0].totalDays : 0;
    const availableLeaves = Math.max(0, totalLeaveQuota - totalApprovedDaysThisYear);

    res.json({
      success: true,
      stats: {
        presentDays,
        halfDays,
        leavesTaken,
        absentDays,
        workingDays,
        attendanceRate: ((presentDays + halfDays * 0.5) / workingDays * 100).toFixed(2),
        attendanceBreakdown: {
          present: ((presentDays / workingDays) * 100).toFixed(2),
          absent: ((absentDays / workingDays) * 100).toFixed(2),
          halfDay: ((halfDays / workingDays) * 100).toFixed(2),
          leave: ((leavesTaken / workingDays) * 100).toFixed(2)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLateCount = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const count = await Attendance.countDocuments({
      employeeId,
      status: 'Late'
    });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const applyLeave = async (req, res) => {
  try {
    const { employeeId, leaveType, fromDate, toDate, reason } = req.body;

    if (!employeeId || !leaveType || !fromDate || !toDate || !reason) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // Validate employeeId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }

    // Calculate number of days between fromDate and toDate (inclusive)
    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (isNaN(start) || isNaN(end) || end < start) {
      return res.status(400).json({ success: false, message: 'Invalid date range.' });
    }
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const formattedFromDate = formatDate(start);
    const formattedToDate = formatDate(end);

    const leave = await LeaveRequest.create({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      leaveType,
      fromDate: formattedFromDate,
      toDate: formattedToDate,
      days,
      reason
    });
    res.json({ success: true, leave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyLeaves = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    // Build query — cast to ObjectId if valid, otherwise try string match
    const query = mongoose.Types.ObjectId.isValid(employeeId)
      ? { employeeId: new mongoose.Types.ObjectId(employeeId) }
      : { employeeId };
    
    const leaves = await LeaveRequest.find(query).sort({ appliedOn: -1 }).limit(20);
    res.json({ success: true, leaves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ employeeId: req.params.employeeId, date: req.params.date });
    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAttendanceLog = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year } = req.query;
    const dateRegex = `^${year}-${String(month).padStart(2, '0')}`;
    
    const records = await Attendance.find({
      employeeId,
      date: { $regex: dateRegex }
    }).sort({ date: -1 });

    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createTask = async (req, res) => {
  try {
    const task = await Task.create(req.body);
    res.json({ success: true, task });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createBulkTasks = async (req, res) => {
  try {
    const { employeeId, tasks, dates, dailyRemarks, weeklyRemarks } = req.body;
    
    // 1. Delete existing tasks for these dates to avoid duplicates
    await Task.deleteMany({ employeeId, date: { $in: dates } });
    
    // 2. Create new tasks
    if (tasks && tasks.length > 0) {
      await Task.insertMany(tasks.map(t => ({ ...t, employeeId })));
    }
    
    // 3. Update Attendance for these dates
    for (const date of dates) {
      const updateData = { workStatus: 'Completed' };
      if (dailyRemarks && dailyRemarks[date]) {
        updateData.remarks = dailyRemarks[date];
      }
      
      await Attendance.findOneAndUpdate(
        { employeeId, date },
        updateData,
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    res.json({ success: true, message: 'Tasks and remarks updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getWeeklyTasks = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;
    
    const tasks = await Task.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate }
    });
    
    res.json({ success: true, tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Employee Notes (messages to admin) ───────────────────────────────────────

export const submitNote = async (req, res) => {
  try {
    const { employeeId, message } = req.body;
    if (!employeeId || !message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Employee ID and message are required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }
    const note = await Note.create({
      employeeId: new mongoose.Types.ObjectId(employeeId),
      message: message.trim(),
    });
    res.json({ success: true, note });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyNotes = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const query = mongoose.Types.ObjectId.isValid(employeeId)
      ? { employeeId: new mongoose.Types.ObjectId(employeeId) }
      : { employeeId };
    const notes = await Note.find(query).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, notes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Resignations ────────────────────────────────────────────────────────────

export const submitResignation = async (req, res) => {
  try {
    const { employeeId, resignationDate, lastWorkingDay, reason, comments } = req.body;
    
    if (!employeeId || !resignationDate || !reason) {
      return res.status(400).json({ success: false, message: 'Required fields are missing.' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID.' });
    }
    
    // Check if there is already an active resignation
    const existing = await Resignation.findOne({ 
      employeeId: new mongoose.Types.ObjectId(employeeId),
      status: { $in: ['PENDING', 'APPROVED'] }
    });
    
    if (existing) {
      return res.status(400).json({ success: false, message: 'You already have an active resignation request.' });
    }
    
    const payload = {
      employeeId: new mongoose.Types.ObjectId(employeeId),
      resignationDate,
      lastWorkingDay,
      reason,
      comments,
      submittedOn: new Date()
    };
    
    if (req.file) {
      payload.attachment = req.file.path;
    }
    
    const resignation = await Resignation.create(payload);
    res.json({ success: true, resignation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyResignations = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const query = mongoose.Types.ObjectId.isValid(employeeId)
      ? { employeeId: new mongoose.Types.ObjectId(employeeId) }
      : { employeeId };
      
    const resignations = await Resignation.find(query).sort({ submittedOn: -1 });
    res.json({ success: true, resignations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getResignationById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid resignation ID.' });
    }
    
    const resignation = await Resignation.findById(id).populate('employeeId', 'fullName empCode email department role profileImage');
    if (!resignation) {
      return res.status(404).json({ success: false, message: 'Resignation not found.' });
    }
    
    res.json({ success: true, resignation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
