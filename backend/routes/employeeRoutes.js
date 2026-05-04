import express from 'express';
import { 
  getProfile, updateProfile, uploadAvatar, tempUploadAvatar, 
  getDirectory, checkIn, getTodayAttendance, getStats, getAttendanceLog,
  applyLeave, getTasks, createTask, createBulkTasks, getWeeklyTasks 
} from '../controllers/employeeController.js';
import { upload } from '../cloudinary.js';

const router = express.Router();

router.get('/profile/:id', getProfile);
router.put('/profile/:id', updateProfile);
router.post('/upload-avatar/:id', upload.single('avatar'), uploadAvatar);
router.post('/upload-avatar/temp', upload.single('avatar'), tempUploadAvatar);
router.get('/directory', getDirectory);
router.post('/attendance/check-in', checkIn);
router.get('/attendance/today/:employeeId', getTodayAttendance);
router.get('/attendance/log/:employeeId', getAttendanceLog);
router.get('/stats/:employeeId', getStats);
router.post('/leaves', applyLeave);
router.get('/tasks/:employeeId/:date', getTasks);
router.get('/tasks/weekly/:employeeId', getWeeklyTasks);
router.post('/tasks', createTask);
router.post('/tasks/bulk', createBulkTasks);

export default router;
