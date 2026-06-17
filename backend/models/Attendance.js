import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  checkIn: { type: Date },
  checkOut: { type: Date },
  workHours: { type: String, default: '0h 0m' }, // e.g. "8h 30m"
  overtime: { type: String, default: '0h 0m' },
  workStatus: { type: String, enum: ['Completed', 'Pending', 'Not Submitted'], default: 'Pending' },
  status: { type: String, enum: ['Present', 'Late', 'Absent', 'Half Day'], default: 'Present' },
  location: {
    lat: Number,
    lng: Number
  },
  lastExitTime: { type: Date },
  remarks: { type: String }
}, { timestamps: true });

export default mongoose.model('Attendance', AttendanceSchema);
