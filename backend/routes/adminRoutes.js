import express from 'express';
import { 
  getEmployees, getExEmployees, createEmployee, updateEmployee, deleteEmployee, 
  getLogs, getStats, getAllAttendance, getWeeklyAttendance, getLeaves, updateLeaveStatus, 
  createNotification, updateSettings, getEmployeeDocuments, uploadDocument, deleteDocument,
  getEmployeeActivityLogs, getAdmins, createAdmin, deleteAdmin, getHourlyReports,
  getEmployeeHourlyReports
} from '../controllers/adminController.js';
import { upload } from '../cloudinary.js';

const router = express.Router();

router.get('/employees', getEmployees);
router.get('/employees/ex', getExEmployees);
router.post('/employees', createEmployee);
router.put('/employees/:id', updateEmployee);
router.delete('/employees/:id', deleteEmployee);
router.get('/logs', getLogs);
router.get('/stats', getStats);
router.get('/attendance/all', getAllAttendance);
router.get('/attendance/weekly', getWeeklyAttendance);
router.get('/leaves', getLeaves);
router.patch('/leaves/:id', updateLeaveStatus);
router.post('/notifications', createNotification);
router.post('/settings', updateSettings);
router.get('/admins', getAdmins);
router.post('/admins', createAdmin);
router.delete('/admins/:id', deleteAdmin);
router.get('/reports/hourly', getHourlyReports);
router.get('/reports/hourly/:id', getEmployeeHourlyReports);

// Documents
router.get('/documents/:employeeId', getEmployeeDocuments);
router.post('/documents', uploadDocument);
router.delete('/documents/:id', deleteDocument);
router.get('/activity-logs/:employeeId', getEmployeeActivityLogs);
router.post('/documents/upload-file', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload failed' });
  res.json({ success: true, url: req.file.path });
});

export default router;
