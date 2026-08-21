import mongoose from 'mongoose';

const DailyRecordSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  checkIn: { type: Date },
  checkOut: { type: Date },
  checkInLocation: {
    lat: Number,
    lng: Number,
    address: String
  },
  checkOutLocation: {
    lat: Number,
    lng: Number,
    address: String
  },
  totalHours: { type: String, default: '0h 0m' },
  regularHours: { type: String, default: '0h 0m' },
  overtimeHours: { type: String, default: '0h 0m' },
  overtimeStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Not Applicable'], default: 'Not Applicable' },
  locationStatus: { type: String, enum: ['Verified', 'Not Verified', 'Pending'], default: 'Pending' },
  workSummary: { type: String }
});

const SiteVisitSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  clientId: { type: String }, // Optional if referring to a specific client collection
  clientName: { type: String, required: true },
  siteName: { type: String, required: true },
  siteAddress: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  geofenceRadius: { type: Number, default: 200 }, // in meters
  purpose: { type: String, required: true },
  contactPerson: { type: String },
  contactNumber: { type: String },
  startDate: { type: String, required: true }, // YYYY-MM-DD
  endDate: { type: String, required: true }, // YYYY-MM-DD
  expectedDailyHours: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed', 'Active'], default: 'Pending' },
  rejectionReason: { type: String },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  approvedAt: { type: Date },
  dailyRecords: [DailyRecordSchema]
}, { timestamps: true });

export default mongoose.model('SiteVisit', SiteVisitSchema);
