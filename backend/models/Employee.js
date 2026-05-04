import mongoose from 'mongoose';

const EmployeeSchema = new mongoose.Schema({
  empCode: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  department: { type: String },
  status: { type: String, default: 'Active' },
  joinDate: { type: Date, default: Date.now },
  profileImage: { type: String },
  role: { type: String, default: 'Team Member' },
  password: { type: String, default: '123456' }
}, { timestamps: true });

export default mongoose.model('Employee', EmployeeSchema);
