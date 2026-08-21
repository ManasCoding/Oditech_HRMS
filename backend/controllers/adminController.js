import Employee from '../models/Employee.js';
import ActivityLog from '../models/ActivityLog.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import SystemSetting from '../models/SystemSetting.js';
import Notification from '../models/Notification.js';
import Document from '../models/Document.js';
import Admin from '../models/Admin.js';
import Note from '../models/Note.js';
import AttendanceAuditLog from '../models/AttendanceAuditLog.js';
import LeaveTransaction from '../models/LeaveTransaction.js';
import { getLeaveBalance } from './leaveAccrualController.js';
import mongoose from 'mongoose';
import Resignation from '../models/Resignation.js';
import Task from '../models/Task.js';
import PerformanceRating from '../models/PerformanceRating.js';
import bcrypt from 'bcrypt';
import exceljs from 'exceljs';
import PDFDocument from 'pdfkit';
import { getIo } from '../socket.js';

export const getEmployees = async (req, res) => {
  try {
    const employees = await Employee.find({ status: 'Active' }).sort({ createdAt: -1 });
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getExEmployees = async (req, res) => {
  try {
    const employees = await Employee.find({ status: 'Ex-Employee' }).sort({ createdAt: -1 });
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createEmployee = async (req, res) => {
  try {
    const employee = await Employee.create(req.body);
    res.json({ success: true, employee });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      let message = `Duplicate value error.`;
      if (field === 'empCode') {
        message = `Employee Code "${value}" already exists. Please use a unique Employee Code.`;
      } else if (field === 'email') {
        message = `Email address "${value}" is already in use. Please use a different email.`;
      }
      return res.status(400).json({ success: false, message });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

export const upgradeEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { employmentType, empCode, role, department, effectiveDate, salary, reason } = req.body;

    const employee = await Employee.findById(id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Ensure empCode isn't taken by someone else
    if (empCode !== employee.empCode) {
      const existing = await Employee.findOne({ empCode });
      if (existing) return res.status(400).json({ success: false, message: 'New Employee ID is already in use.' });
    }

    // Push current state to history
    employee.employmentHistory.push({
      empCode: employee.empCode,
      employmentType: employee.employmentType,
      designation: employee.role,
      department: employee.department,
      startDate: employee.joinDate,
      endDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      status: 'Completed',
      reason: reason || 'Upgraded'
    });

    // Update main record
    employee.empCode = empCode || employee.empCode;
    employee.employmentType = employmentType || employee.employmentType;
    employee.role = role || employee.role;
    employee.department = department || employee.department;
    if (effectiveDate) employee.joinDate = new Date(effectiveDate);
    // Assuming salary is kept somewhere else or we can add it, we push to history above.

    await employee.save();
    res.json({ success: true, employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      const value = error.keyValue[field];
      let message = `Duplicate value error.`;
      if (field === 'empCode') {
        message = `Employee Code "${value}" already exists. Please use a unique Employee Code.`;
      } else if (field === 'email') {
        message = `Email address "${value}" is already in use. Please use a different email.`;
      }
      return res.status(400).json({ success: false, message });
    }
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const { permanent } = req.query;
    if (permanent === 'true') {
      const employee = await Employee.findByIdAndDelete(req.params.id);
      if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
      return res.json({ success: true, message: 'Employee record permanently deleted' });
    } else {
      const employee = await Employee.findByIdAndUpdate(req.params.id, { status: 'Ex-Employee' }, { new: true });
      if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
      res.json({ success: true, message: 'Employee moved to archives' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLogs = async (req, res) => {
  try {
    const logs = await ActivityLog.find()
      .populate('adminId', 'fullName')
      .sort({ timestamp: -1 })
      .limit(10);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getStats = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const targetDate = req.query.date || today;
    
    const employees = await Employee.find({ status: 'Active' });
    const attendances = await Attendance.find({ date: targetDate });
    const leaves = await LeaveRequest.find({ 
      status: 'APPROVED', 
      fromDate: { $lte: targetDate }, 
      toDate: { $gte: targetDate } 
    });

    let presentToday = 0;
    let halfDayToday = 0;
    let lateToday = 0;
    let leavesToday = 0;
    let absentToday = 0;

    employees.forEach(emp => {
      const att = attendances.find(a => a.employeeId.toString() === emp._id.toString());
      const leave = leaves.find(l => l.employeeId.toString() === emp._id.toString());

      if (att) {
        if (att.status === 'Present' || att.status === 'Late') {
          presentToday++;
          if (att.status === 'Late') lateToday++;
        } else if (att.status === 'Half Day') {
          halfDayToday++;
        } else if (att.status === 'Absent') {
          absentToday++;
        }
      } else if (leave) {
        leavesToday++;
      } else {
        absentToday++;
      }
    });

    res.json({
      success: true,
      stats: {
        totalEmployees: employees.length,
        presentToday,
        halfDayToday,
        lateToday,
        leavesToday,
        absentToday
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllAttendance = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const targetDate = req.query.date || today;
    
    const employees = await Employee.find({ status: 'Active' }).select('fullName empCode profileImage department role designation');
    const attendances = await Attendance.find({ date: targetDate });
    const leaves = await LeaveRequest.find({ 
      status: 'APPROVED', 
      fromDate: { $lte: targetDate }, 
      toDate: { $gte: targetDate } 
    });
    
    const records = employees.map(emp => {
      const att = attendances.find(a => a.employeeId.toString() === emp._id.toString());
      const leave = leaves.find(l => l.employeeId.toString() === emp._id.toString());
      
      let status = 'Absent';
      let checkIn = null;
      let checkOut = null;
      let workHours = null;
      let overtime = null;
      let _id = emp._id.toString();

      if (att) {
        status = att.status;
        checkIn = att.checkIn;
        checkOut = att.checkOut;
        workHours = att.workHours;
        overtime = att.overtime;
        _id = att._id;
      } else if (leave) {
        status = 'On Leave';
      }

      return {
        _id,
        employeeId: emp,
        status,
        checkIn,
        checkOut,
        workHours,
        overtime,
        date: targetDate
      };
    });

    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLeaves = async (req, res) => {
  try {
    const leaves = await LeaveRequest.find().populate('employeeId', 'fullName empCode').sort({ appliedOn: -1 });
    res.json({ success: true, leaves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLeaveStatus = async (req, res) => {
  try {
    const { status, approvedBy } = req.body;
    
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    // Fetch old leave first so we know previous status for reversal logic
    const oldLeave = await LeaveRequest.findById(req.params.id);
    if (!oldLeave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    const leave = await LeaveRequest.findByIdAndUpdate(
      req.params.id, 
      { status, approvedBy, approvedOn: new Date() },
      { new: true }
    );

    const empId = leave.employeeId;

    // ── Record leave transaction for earned leave balance tracking ────────────
    try {
      if (status === 'APPROVED' && oldLeave.status !== 'APPROVED') {
        // Deduct from earned leave balance
        const currentBalance = await getLeaveBalance(empId.toString());
        const newBalance = currentBalance - leave.days;
        await LeaveTransaction.create({
          employeeId: empId,
          transactionType: 'LEAVE_USED',
          amount: -leave.days,
          leaveType: leave.leaveType,
          leaveRequestId: leave._id,
          reason: `Approved leave: ${leave.leaveType} from ${leave.fromDate} to ${leave.toDate}`,
          balanceAfterTransaction: Math.max(0, newBalance),
          createdBy: approvedBy || null
        });
      } else if (status === 'REJECTED' && oldLeave.status === 'APPROVED') {
        // Reverse a previously approved leave — restore balance
        const currentBalance = await getLeaveBalance(empId.toString());
        const newBalance = currentBalance + leave.days;
        await LeaveTransaction.create({
          employeeId: empId,
          transactionType: 'LEAVE_REVERSAL',
          amount: leave.days,
          leaveType: leave.leaveType,
          leaveRequestId: leave._id,
          reason: `Leave reversed/rejected: ${leave.leaveType} from ${leave.fromDate} to ${leave.toDate}`,
          balanceAfterTransaction: newBalance,
          createdBy: approvedBy || null
        });
      }
    } catch (txErr) {
      // Non-critical: log but don't fail the leave status update
      console.error('LeaveTransaction record error:', txErr.message);
    }
    // ───────────────────────────────────────────────────────────────────

    res.json({ success: true, leave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createNotification = async (req, res) => {
  try {
    const notice = await Notification.create(req.body);
    res.json({ success: true, notification: notice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const { key, value, settings } = req.body;
    if (settings && Array.isArray(settings)) {
      // Check if maintenance_mode is set to true/enabled in settings array
      const maintItem = settings.find(s => s.key === 'maintenance_mode');
      if (maintItem && (maintItem.value === 'true' || maintItem.value === true)) {
        // Only set maintenance_start_time if maintenance mode was not already enabled
        const existing = await SystemSetting.findOne({ key: 'maintenance_mode' });
        const alreadyEnabled = existing && (existing.value === 'true' || existing.value === true);
        if (!alreadyEnabled) {
          await SystemSetting.findOneAndUpdate(
            { key: 'maintenance_start_time' },
            { value: new Date().toISOString() },
            { upsert: true }
          );
        }
      }
      for (const item of settings) {
        await SystemSetting.findOneAndUpdate({ key: item.key }, { value: item.value }, { upsert: true });
      }
    } else {
      if (key === 'maintenance_mode' && (value === 'true' || value === true)) {
        const existing = await SystemSetting.findOne({ key: 'maintenance_mode' });
        const alreadyEnabled = existing && (existing.value === 'true' || existing.value === true);
        if (!alreadyEnabled) {
          await SystemSetting.findOneAndUpdate(
            { key: 'maintenance_start_time' },
            { value: new Date().toISOString() },
            { upsert: true }
          );
        }
      }
      await SystemSetting.findOneAndUpdate({ key }, { value }, { upsert: true });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find({}, '-password').sort({ createdAt: -1 });
    res.json({ success: true, admins });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createAdmin = async (req, res) => {
  const { fullName, email, password } = req.body;
  try {
    const exists = await Admin.findOne({ email });
    if (exists) return res.status(400).json({ success: false, message: 'Admin with this email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ fullName, email, password: hashedPassword });
    res.status(201).json({ success: true, admin: { _id: admin._id, fullName, email } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAdmin = async (req, res) => {
  try {
    await Admin.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Administrator removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const checkAdminEmail = async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
  try {
    const admin = await Admin.findOne({ email }, '-password');
    if (admin) {
      res.json({ exists: true, admin });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdmin = async (req, res) => {
  const { id } = req.params;
  const { fullName, email, password } = req.body;
  try {
    let updateData = { fullName, email };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const admin = await Admin.findByIdAndUpdate(id, updateData, { new: true, select: '-password' });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    res.json({ success: true, message: 'Administrator account updated successfully', admin });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getHourlyReports = async (req, res) => {
  try {
    const { date, department, employeeId, status, search, page = 1, limit = 8 } = req.query;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const targetDate = date || today;
    
    // Build filter
    let query = { date: targetDate };
    if (status && status !== 'All Status') query.workStatus = status;
    if (employeeId && employeeId !== 'All Employees') query.employeeId = employeeId;
    
    // If filtering by department, we need to find employees in that dept first
    if (department && department !== 'All Departments') {
      const deptEmployees = await Employee.find({ department }).select('_id');
      const deptIds = deptEmployees.map(e => e._id);
      query.employeeId = { $in: deptIds };
    }

    // Fetch data
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const attendances = await Attendance.find(query)
      .populate('employeeId', 'fullName empCode department profileImage')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const totalEntries = await Attendance.countDocuments(query);
    const totalEmployees = await Employee.countDocuments({ status: 'Active' });

    // Calculate Stats for Today
    const todayReports = await Attendance.find({ date: targetDate });
    
    let totalMinutes = 0;
    let overtimeMinutes = 0;
    
    todayReports.forEach(r => {
      // Parse "8h 30m" format or calculate if empty
      let mins = 0;
      if (r.workHours && r.workHours !== '0h 0m') {
        const hMatch = r.workHours.match(/(\d+)h/);
        const mMatch = r.workHours.match(/(\d+)m/);
        if (hMatch) mins += parseInt(hMatch[1]) * 60;
        if (mMatch) mins += parseInt(mMatch[1]);
      } else if (r.checkIn && r.checkOut) {
        mins = Math.floor((new Date(r.checkOut) - new Date(r.checkIn)) / (1000 * 60));
        r.workHours = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      }
      
      totalMinutes += mins;

      if (r.overtime && r.overtime !== '0h 0m') {
        const ohMatch = r.overtime.match(/(\d+)h/);
        const omMatch = r.overtime.match(/(\d+)m/);
        if (ohMatch) overtimeMinutes += parseInt(ohMatch[1]) * 60;
        if (omMatch) overtimeMinutes += parseInt(omMatch[1]);
      }
    });

    const totalHoursToday = `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
    const totalOvertimeToday = `${Math.floor(overtimeMinutes / 60)}h ${overtimeMinutes % 60}m`;
    
    const avgMin = totalEmployees > 0 ? Math.floor(totalMinutes / totalEmployees) : 0;
    const averageHours = `${Math.floor(avgMin / 60)}h ${avgMin % 60}m`;

    // Today's Summary (Department wise)
    const deptSummary = {};
    const employees = await Employee.find({ status: 'Active' }).select('_id department');
    
    todayReports.forEach(r => {
      const emp = employees.find(e => e._id.toString() === r.employeeId.toString());
      if (emp && emp.department) {
        const dept = emp.department;
        let mins = 0;
        if (r.workHours && r.workHours !== '0h 0m') {
          const hMatch = r.workHours.match(/(\d+)h/);
          const mMatch = r.workHours.match(/(\d+)m/);
          if (hMatch) mins += parseInt(hMatch[1]) * 60;
          if (mMatch) mins += parseInt(mMatch[1]);
        } else if (r.checkIn && r.checkOut) {
          mins = Math.floor((new Date(r.checkOut) - new Date(r.checkIn)) / (1000 * 60));
        }
        
        deptSummary[dept] = (deptSummary[dept] || 0) + mins;
      }
    });

    const summaryData = Object.keys(deptSummary).map(dept => ({
      name: dept,
      hours: `${Math.floor(deptSummary[dept] / 60)}h ${deptSummary[dept] % 60}m`,
      minutes: deptSummary[dept]
    })).sort((a, b) => b.minutes - a.minutes);

    // Report Status
    const statusCounts = {
      Completed: await Attendance.countDocuments({ date: targetDate, workStatus: 'Completed' }),
      Pending: await Attendance.countDocuments({ date: targetDate, workStatus: 'Pending' }),
      NotSubmitted: totalEmployees - await Attendance.countDocuments({ date: targetDate })
    };

    // Filter out employees who have already been rated for the target date
    const ratedRecords = await PerformanceRating.find({ workDate: new Date(targetDate) }).select('employeeId');
    const ratedEmployeeIds = new Set(ratedRecords.map(r => r.employeeId.toString()));
    const unratedAttendances = attendances.filter(a => a.employeeId && !ratedEmployeeIds.has(a.employeeId._id.toString()));

    res.json({
      success: true,
      stats: {
        totalEmployees,
        totalHoursToday,
        averageHours,
        totalOvertimeToday
      },
      reports: unratedAttendances,
      totalEntries: unratedAttendances.length,
      summary: summaryData,
      statusCounts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getEmployeeHourlyReports = async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;
    
    let query = { employeeId: id };
    
    if (month && year) {
      // Create a regex for the date string (YYYY-MM-)
      const m = parseInt(month) < 10 ? `0${month}` : month;
      const datePrefix = `${year}-${m}`;
      query.date = { $regex: `^${datePrefix}` };
    }

    const reports = await Attendance.find(query).sort({ date: -1 });

    res.json({
      success: true,
      reports
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getEmployeeActivityLogs = async (req, res) => {
  try {
    const logs = await ActivityLog.find({ 
      employeeId: req.params.employeeId, 
      action: 'Login' 
    }).sort({ timestamp: -1 }).limit(20);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getEmployeeDocuments = async (req, res) => {
  try {
    const docs = await Document.find({ employeeId: req.params.employeeId }).sort({ uploadedAt: -1 });
    res.json({ success: true, documents: docs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const uploadDocument = async (req, res) => {
  try {
    const { employeeId, title, category, fileUrl, fileType, fileSize } = req.body;
    const doc = await Document.create({
      employeeId,
      title,
      category,
      fileUrl,
      fileType,
      fileSize,
      uploadedBy: req.admin?._id // If auth middleware provides it
    });
    res.json({ success: true, document: doc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    await Document.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getWeeklyAttendance = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const endDate = req.query.endDate || today;
    const end = new Date(endDate);
    const weekly = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

      const present = await Attendance.countDocuments({ date: dateStr, status: { $in: ['Present', 'Late'] } });
      const late = await Attendance.countDocuments({ date: dateStr, status: 'Late' });
      const half = await Attendance.countDocuments({ date: dateStr, status: 'Half Day' });

      weekly.push({ name: dayName, present, late, half, fullDate: dateStr });
    }

    res.json({ success: true, weekly });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPresentEmployees = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const date = req.query.date || today;

    const attendances = await Attendance.find({ date, status: { $in: ['Present', 'Late'] } }).populate('employeeId');
    const employees = attendances.map(a => a.employeeId).filter(e => e && e.status === 'Active');
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getHalfDayEmployees = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const date = req.query.date || today;

    const attendances = await Attendance.find({ date, status: 'Half Day' }).populate('employeeId');
    const employees = attendances.map(a => a.employeeId).filter(e => e && e.status === 'Active');
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLateEmployees = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const date = req.query.date || today;

    const attendances = await Attendance.find({ date, status: 'Late' }).populate('employeeId');
    const employees = attendances.map(a => a.employeeId).filter(e => e && e.status === 'Active');
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAbsentEmployees = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const date = req.query.date || today;

    const allActiveEmployees = await Employee.find({ status: 'Active' });
    const attendances = await Attendance.find({ date });
    const leaves = await LeaveRequest.find({ 
      status: 'APPROVED', 
      fromDate: { $lte: date }, 
      toDate: { $gte: date } 
    });

    const attendedIds = attendances.map(a => a.employeeId.toString());
    const leaveIds = leaves.map(l => l.employeeId.toString());

    const absentEmployees = allActiveEmployees.filter(emp => 
      !attendedIds.includes(emp._id.toString()) && !leaveIds.includes(emp._id.toString())
    );

    res.json({ success: true, employees: absentEmployees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getActiveLeaveEmployees = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const date = req.query.date || today;

    const leaves = await LeaveRequest.find({ 
      status: 'APPROVED', 
      fromDate: { $lte: date }, 
      toDate: { $gte: date } 
    }).populate('employeeId');

    const employees = leaves.map(l => l.employeeId).filter(e => e && e.status === 'Active');
    res.json({ success: true, employees });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getEmployeeNotes = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const notes = await Note.find({ employeeId }).sort({ createdAt: -1 }).limit(100);
    // Mark all as read
    await Note.updateMany({ employeeId, isRead: false }, { isRead: true });
    res.json({ success: true, notes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const exportAttendanceExcel = async (req, res) => {
  try {
    const { date } = req.query;
    const now = new Date();
    const targetDate = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const attendances = await Attendance.find({ date: targetDate }).populate('employeeId', 'fullName empCode department');

    const workbook = new exceljs.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report');

    worksheet.columns = [
      { header: 'Emp Code', key: 'empCode', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Check In', key: 'checkIn', width: 20 },
      { header: 'Check Out', key: 'checkOut', width: 20 },
      { header: 'Work Hours', key: 'workHours', width: 15 }
    ];

    attendances.forEach(att => {
      worksheet.addRow({
        empCode: att.employeeId?.empCode || 'N/A',
        name: att.employeeId?.fullName || 'N/A',
        department: att.employeeId?.department || 'N/A',
        status: att.status,
        checkIn: att.checkIn ? new Date(att.checkIn).toLocaleTimeString() : 'N/A',
        checkOut: att.checkOut ? new Date(att.checkOut).toLocaleTimeString() : 'N/A',
        workHours: att.workHours || '0h 0m'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Attendance_${targetDate}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const exportAttendancePdf = async (req, res) => {
  try {
    const { date } = req.query;
    const now = new Date();
    const targetDate = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const attendances = await Attendance.find({ date: targetDate }).populate('employeeId', 'fullName empCode');

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Attendance_${targetDate}.pdf"`);
    
    doc.pipe(res);
    
    doc.fontSize(20).text(`Attendance Report - ${targetDate}`, { align: 'center' });
    doc.moveDown();

    attendances.forEach(att => {
      doc.fontSize(12).text(`Emp Code: ${att.employeeId?.empCode || 'N/A'}`);
      doc.text(`Name: ${att.employeeId?.fullName || 'N/A'}`);
      doc.text(`Status: ${att.status}`);
      doc.text(`Check In: ${att.checkIn ? new Date(att.checkIn).toLocaleTimeString() : 'N/A'}`);
      doc.text(`Check Out: ${att.checkOut ? new Date(att.checkOut).toLocaleTimeString() : 'N/A'}`);
      doc.text(`Work Hours: ${att.workHours || '0h 0m'}`);
      doc.moveDown();
    });

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateEmployeeCheckIn = async (req, res) => {
  try {
    const { employeeId, date, checkInTime } = req.body;
    
    if (!employeeId || !date || !checkInTime) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // checkInTime is "HH:mm"
    const checkInDate = new Date(`${date}T${checkInTime}:00`);
    
    // Late threshold: 9:30 AM (consistent with employee self-check-in)
    const lateThreshold = new Date(`${date}T09:30:00`);
    const status = checkInDate > lateThreshold ? 'Late' : 'Present';

    let record = await Attendance.findOne({ employeeId, date });

    if (record) {
      record.checkIn = checkInDate;
      record.status = status;

      if (record.checkOut) {
        const mins = Math.floor((new Date(record.checkOut) - checkInDate) / (1000 * 60));
        record.workHours = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      }
      await record.save();
    } else {
      record = await Attendance.create({
        employeeId,
        date,
        checkIn: checkInDate,
        status,
        workStatus: 'Pending'
      });
    }

    res.json({ success: true, record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateEmployeeCheckOut = async (req, res) => {
  try {
    const { employeeId, date, checkOutTime } = req.body;
    
    if (!employeeId || !date || !checkOutTime) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const checkOutDate = new Date(`${date}T${checkOutTime}:00`);

    let record = await Attendance.findOne({ employeeId, date });

    if (record) {
      record.checkOut = checkOutDate;

      if (record.checkIn) {
        const mins = Math.floor((checkOutDate - new Date(record.checkIn)) / (1000 * 60));
        record.workHours = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      }
      await record.save();
    } else {
      record = await Attendance.create({
        employeeId,
        date,
        checkOut: checkOutDate,
        status: 'Absent',
        workStatus: 'Pending'
      });
    }

    res.json({ success: true, record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAttendanceStatus = async (req, res) => {
  try {
    const { employeeId, date, status } = req.body;
    
    if (!employeeId || !date || !status) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    let formattedDate = date;
    if (formattedDate.includes('T')) {
      formattedDate = formattedDate.split('T')[0];
    }

    const record = await Attendance.findOneAndUpdate(
      { employeeId, date: formattedDate },
      { 
        $set: { 
          status,
          workStatus: 'Pending'
        } 
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAttendanceRecord = async (req, res) => {
  try {
    const { id } = req.params; // Can be 'new' or valid ObjectId
    const { status, employeeId, date } = req.body;
    
    // Auth Check: We assume the route is protected or we check headers
    // In a full implementation, you'd verify req.user.role === 'admin'
    
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const validStatuses = ['Present', 'Absent', 'Half Day', 'Late', 'Paid Leave', 'Unpaid Leave', 'Holiday', 'Weekend'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    let record;
    let oldStatus = 'Absent';

    if (id !== 'new') {
      record = await Attendance.findById(id);
      if (!record) {
        return res.status(404).json({ success: false, message: 'Attendance record not found' });
      }
      // Date cannot be in the future
      if (new Date(record.date) > new Date()) {
        return res.status(400).json({ success: false, message: 'Cannot update future attendance dates' });
      }
      oldStatus = record.status || 'Absent';
      record.status = status;
      await record.save();
    } else {
      if (!employeeId || !date) {
        return res.status(400).json({ success: false, message: 'Employee ID and Date are required for new records' });
      }
      if (new Date(date) > new Date()) {
        return res.status(400).json({ success: false, message: 'Cannot update future attendance dates' });
      }
      
      // Force date to YYYY-MM-DD
      let formattedDate = date;
      if (formattedDate.includes('T')) {
        formattedDate = formattedDate.split('T')[0];
      }
      
      const existing = await Attendance.findOne({ employeeId, date: formattedDate });
      oldStatus = existing ? (existing.status || 'Absent') : 'Absent';

      record = await Attendance.findOneAndUpdate(
        { employeeId, date: formattedDate },
        { 
          $set: { 
            status,
            workStatus: 'Pending'
          } 
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    }
    
    // Create Audit Log
    // For updatedBy, we can parse from token or simply pass it in body if token parsing isn't setup
    // Using a placeholder for now if updatedBy isn't provided
    const updatedBy = req.body.updatedBy || null;

    await AttendanceAuditLog.create({
      employeeId: record.employeeId,
      attendanceId: record._id,
      attendanceDate: record.date,
      oldStatus,
      newStatus: status,
      updatedBy,
      reason: "Manual Admin Update"
    });

    res.json({ success: true, record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllResignations = async (req, res) => {
  try {
    const { status, search } = req.query;

    let query = {};
    if (status && status !== 'All Status') {
      query.status = status.toUpperCase();
    }

    let resignations = await Resignation.find(query)
      .populate('employeeId', 'fullName empCode department profileImage designation')
      .sort({ submittedOn: -1 });

    // Search filter by employee name
    if (search) {
      const lower = search.toLowerCase();
      resignations = resignations.filter(r =>
        r.employeeId?.fullName?.toLowerCase().includes(lower) ||
        r.employeeId?.empCode?.toLowerCase().includes(lower)
      );
    }

    const total = resignations.length;
    const pending = resignations.filter(r => r.status === 'PENDING').length;
    const approved = resignations.filter(r => r.status === 'APPROVED').length;
    const rejected = resignations.filter(r => r.status === 'REJECTED').length;

    res.json({
      success: true,
      resignations,
      stats: { total, pending, approved, rejected }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateResignationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const resignation = await Resignation.findByIdAndUpdate(
      req.params.id,
      { status, reviewedOn: new Date() },
      { new: true }
    ).populate('employeeId', 'fullName empCode department profileImage designation');

    if (!resignation) {
      return res.status(404).json({ success: false, message: 'Resignation not found' });
    }

    res.json({ success: true, resignation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Admin: Read employee's submitted timesheet tasks for a given date ─────────
export const getEmployeeTasksByDate = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'date query param is required' });
    }

    const tasks = await Task.find({ employeeId, date }).sort({ slotKey: 1 });
    const attendance = await Attendance.findOne({ employeeId, date });
    const employee = await Employee.findById(employeeId).select('fullName empCode department profileImage designation');

    res.json({ success: true, tasks, attendance, employee });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Admin: Late Check-In Approvals ───────────────────────────────────────────

/**
 * GET /api/admin/attendance/late-approvals
 * Returns all attendance records where checkInApprovalStatus is 'Pending'
 * Optionally filtered by ?date=YYYY-MM-DD (defaults to today)
 */
export const getLateApprovals = async (req, res) => {
  try {
    const now = new Date();
    const tzStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const localDate = new Date(tzStr);
    const today = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;

    const date = req.query.date || today;
    const statusFilter = req.query.status || 'Pending'; // 'Pending' | 'All'

    const query = statusFilter === 'All'
      ? { checkInApprovalStatus: { $in: ['Pending', 'Approved', 'Rejected'] } }
      : { checkInApprovalStatus: 'Pending' };

    if (date !== 'all') {
      query.date = date;
    }

    const records = await Attendance.find(query)
      .populate('employeeId', 'fullName empCode department profileImage designation')
      .populate('approvedBy', 'fullName')
      .populate('rejectedBy', 'fullName')
      .sort({ approvalRequestedAt: -1 });

    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/admin/attendance/late-approvals/:id/approve
 * Approves a pending late check-in request.
 * Sets status='Late', checkInApprovalStatus='Approved', preserves original checkIn time.
 */
export const approveLateCheckIn = async (req, res) => {
  try {
    const { id } = req.params;
    // adminId should come from auth middleware; fallback to body for compatibility
    const adminId = req.admin?._id || req.body.adminId || null;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid attendance record ID' });
    }

    const record = await Attendance.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    if (record.checkInApprovalStatus !== 'Pending') {
      return res.status(400).json({ success: false, message: `Request is already ${record.checkInApprovalStatus.toLowerCase()}` });
    }

    // Preserve original checkIn time — only update status fields
    if (record.status === 'Absent') {
      record.status = 'Present';
    }
    record.isLate = true;
    record.checkInApprovalStatus = 'Approved';
    record.approvedBy = adminId;
    record.approvedAt = new Date();

    await record.save();

    // Audit log
    await AttendanceAuditLog.create({
      employeeId: record.employeeId,
      attendanceId: record._id,
      attendanceDate: record.date,
      oldStatus: 'Absent',
      newStatus: 'Present',
      updatedBy: adminId,
      reason: 'Late check-in approved by admin'
    });

    const populated = await record.populate([
      { path: 'employeeId', select: 'fullName empCode department profileImage designation' },
      { path: 'approvedBy', select: 'fullName' }
    ]);

    res.json({ success: true, record: populated, message: 'Late check-in approved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/admin/attendance/late-approvals/:id/reject
 * Rejects a pending late check-in request.
 * Sets checkInApprovalStatus='Rejected', status remains 'Absent'.
 */
export const rejectLateCheckIn = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.admin?._id || req.body.adminId || null;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid attendance record ID' });
    }

    const record = await Attendance.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    if (record.checkInApprovalStatus !== 'Pending') {
      return res.status(400).json({ success: false, message: `Request is already ${record.checkInApprovalStatus.toLowerCase()}` });
    }

    record.checkInApprovalStatus = 'Rejected';
    record.rejectedBy = adminId;
    record.rejectedAt = new Date();
    record.rejectionReason = rejectionReason || '';
    record.status = 'Absent'; // explicitly set to Absent

    await record.save();

    // Audit log
    await AttendanceAuditLog.create({
      employeeId: record.employeeId,
      attendanceId: record._id,
      attendanceDate: record.date,
      oldStatus: 'Absent',
      newStatus: 'Absent',
      updatedBy: adminId,
      reason: `Late check-in rejected: ${rejectionReason || 'No reason given'}`
    });

    const populated = await record.populate([
      { path: 'employeeId', select: 'fullName empCode department profileImage designation' },
      { path: 'rejectedBy', select: 'fullName' }
    ]);

    res.json({ success: true, record: populated, message: 'Late check-in rejected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

