import mongoose from 'mongoose';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import Task from '../models/Task.js';
import SystemSetting from '../models/SystemSetting.js';

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
  
  // Get local date in YYYY-MM-DD format
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  
  try {
    let attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance) {
      // Get settings for late threshold
      const lateSetting = await SystemSetting.findOne({ key: 'late_threshold' });
      const lateThreshold = lateSetting ? lateSetting.value : '09:40';
      
      const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + 
                             now.getMinutes().toString().padStart(2, '0');
      
      let status = 'Present';
      if (currentTimeStr > lateThreshold) {
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
    // Already checked in
    return res.json({ success: true, attendance, alreadyCheckedIn: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTodayAttendance = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

    // Present days (attendance records in period)
    const presentDays = await Attendance.countDocuments({
      employeeId,
      date: { $regex: dateRegex }
    });

    // Late comings in period
    const lateComings = await Attendance.countDocuments({
      employeeId,
      date: { $regex: dateRegex },
      status: 'Late'
    });

    // Half days in period
    const halfDays = await Attendance.countDocuments({
      employeeId,
      date: { $regex: dateRegex },
      status: 'Half Day'
    });

    // Working days in the period (Mon-Fri count)
    const startDate = isYearly
      ? new Date(`${targetYear}-01-01`)
      : new Date(`${targetYear}-${targetMonth}-01`);
    const endDate = isYearly
      ? new Date(`${targetYear}-12-31`)
      : new Date(targetYear, parseInt(targetMonth), 0); // last day of month
    const effectiveEnd = endDate > now ? now : endDate;

    let workingDays = 0;
    const d = new Date(startDate);
    while (d <= effectiveEnd) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) workingDays++;
      d.setDate(d.getDate() + 1);
    }

    // Leaves taken in period (approved leaves)
    const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const periodStart = formatDate(startDate);
    const periodEnd = formatDate(effectiveEnd);
    const approvedLeaves = await LeaveRequest.find({
      employeeId,
      status: 'APPROVED',
      fromDate: { $lte: periodEnd },
      toDate: { $gte: periodStart }
    });

    // Count leave days (each leave request, count overlap days)
    let leavesTaken = 0;
    for (const leave of approvedLeaves) {
      const lStart = new Date(Math.max(new Date(leave.fromDate), startDate));
      const lEnd = new Date(Math.min(new Date(leave.toDate), effectiveEnd));
      const diffDays = Math.round((lEnd - lStart) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 0) leavesTaken += diffDays;
    }

    // Pending leave requests (all time - sum of days)
    const pendingLeavesResult = await LeaveRequest.aggregate([
      { 
        $match: { 
          employeeId: mongoose.Types.ObjectId.isValid(employeeId) ? new mongoose.Types.ObjectId(employeeId) : employeeId, 
          status: 'PENDING' 
        } 
      },
      { $group: { _id: null, totalDays: { $sum: '$days' } } }
    ]);
    const pendingLeaves = pendingLeavesResult.length > 0 ? pendingLeavesResult[0].totalDays : 0;

    // Absent = working days - present - half days - leaves taken
    const absentDays = Math.max(0, workingDays - presentDays - halfDays - leavesTaken);

    // Available leaves = quota - total approved leave days this year
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;
    
    const approvedThisYearResult = await LeaveRequest.aggregate([
      { 
        $match: { 
          $or: [
            { employeeId: mongoose.Types.ObjectId.isValid(employeeId) ? new mongoose.Types.ObjectId(employeeId) : null },
            { employeeId: employeeId }
          ],
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
        lateComings,
        halfDays,
        leavesTaken,
        leavesTakenYearly: totalApprovedDaysThisYear,
        pendingLeaves,
        absentDays,
        workingDays,
        availableLeaves,
        totalLeaveQuota
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const applyLeave = async (req, res) => {
  try {
    const leave = await LeaveRequest.create(req.body);
    res.json({ success: true, leave });
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
