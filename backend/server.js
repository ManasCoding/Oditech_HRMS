import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import connectDB from './db.js';
import Admin from './models/Admin.js';
import SystemSetting from './models/SystemSetting.js';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import publicRoutes from './routes/publicRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 7000;

// Security Middleware
app.use(helmet({
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// Middleware
app.use(cors());
app.use(express.json());

// Seed Default Admin & Settings
const seedData = async () => {
  try {
    // Admin
    const targetEmail = 'gumansingh.oditechglobal@gmail.com';
    if (!(await Admin.findOne({ email: targetEmail }))) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await Admin.create({ fullName: 'Guman Singh', email: targetEmail, password: hashedPassword });
      console.log(`Admin seeded: ${targetEmail}`);
    }

    // Default Settings
    const defaultSettings = [
      { key: 'workday_start', value: '09:30' },
      { key: 'logout_time', value: '18:30' },
      { key: 'late_threshold', value: '09:40' },
      { key: 'max_work_hours', value: 9.0 },
      { key: 'casual_leave', value: 12 },
      { key: 'sick_leave', value: 10 },
      { key: 'office_lat', value: 20.2961 },
      { key: 'office_lng', value: 85.8331 },
      { key: 'geofence_radius', value: 50 }
    ];

    for (const setting of defaultSettings) {
      await SystemSetting.findOneAndUpdate(
        { key: setting.key },
        { value: setting.value },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('Error seeding data:', err.message);
  }
};

connectDB().then(seedData);

// Routes
app.use('/api', authRoutes); // Includes /login, /auth/forgot-password etc.
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes); // Includes /notifications, /settings

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
