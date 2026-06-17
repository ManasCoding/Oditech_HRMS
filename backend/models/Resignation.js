import mongoose from 'mongoose';

const ResignationSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  resignationDate: { type: String, required: true },
  lastWorkingDay: { type: String },
  reason: { type: String, required: true },
  comments: { type: String },
  attachment: { type: String },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  submittedOn: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  reviewedOn: { type: Date }
}, { timestamps: true });

export default mongoose.model('Resignation', ResignationSchema);
