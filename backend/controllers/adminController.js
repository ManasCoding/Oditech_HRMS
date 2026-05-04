import Employee from '../models/Employee.js';
import ActivityLog from '../models/ActivityLog.js';
import Attendance from '../models/Attendance.js';
import LeaveRequest from '../models/LeaveRequest.js';
import SystemSetting from '../models/SystemSetting.js';
import Notification from '../models/Notification.js';
import Document from '../models/Document.js';
import Admin from '../models/Admin.js';
import bcrypt from 'bcrypt';

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
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (error) {
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
    
    const totalEmployees = await Employee.countDocuments({ status: 'Active' });
    const presentToday = await Attendance.countDocuments({ date: targetDate, status: 'Present' });
    const halfDayToday = await Attendance.countDocuments({ date: targetDate, status: 'Half Day' });
    const lateToday = await Attendance.countDocuments({ date: targetDate, status: 'Late' });
    const leavesToday = await LeaveRequest.countDocuments({ 
      status: 'APPROVED', 
      fromDate: { $lte: targetDate }, 
      toDate: { $gte: targetDate } 
    });
    const totalPresent = presentToday + halfDayToday + lateToday;
    const absentToday = Math.max(0, totalEmployees - totalPresent - leavesToday);
    
    res.json({
      success: true,
      stats: {
        totalEmployees,
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
    
    const employees = await Employee.find({ status: 'Active' }).select('fullName empCode profileImage');
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
      let workHours = null;

      if (att) {
        status = att.status;
        checkIn = att.checkIn;
        workHours = att.workHours;
      } else if (leave) {
        status = 'On Leave';
      }

      return {
        employeeId: emp,
        status,
        checkIn,
        workHours
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

    const leave = await LeaveRequest.findByIdAndUpdate(
      req.params.id, 
      { status, approvedBy, approvedOn: new Date() },
      { returnDocument: 'after' }
    );

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

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
      for (const item of settings) {
        await SystemSetting.findOneAndUpdate({ key: item.key }, { value: item.value }, { upsert: true });
      }
    } else {
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

    res.json({
      success: true,
      stats: {
        totalEmployees,
        totalHoursToday,
        averageHours,
        totalOvertimeToday
      },
      reports: attendances,
      totalEntries,
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

      const present = await Attendance.countDocuments({ date: dateStr, status: 'Present' });
      const late = await Attendance.countDocuments({ date: dateStr, status: 'Late' });
      const half = await Attendance.countDocuments({ date: dateStr, status: 'Half Day' });

      weekly.push({ name: dayName, present, late, half, fullDate: dateStr });
    }

    res.json({ success: true, weekly });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
