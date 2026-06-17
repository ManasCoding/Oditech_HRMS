import cron from 'node-cron';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';

export const initCronJobs = () => {
  // Run every day at 18:30 (6:30 PM)
  cron.schedule('30 18 * * *', async () => {
    console.log('Running automated 6:30 PM check-out job...');
    
    try {
      const now = new Date();
      // Ensure we format the date based on local time
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;

      // Find all attendances for today that haven't been checked out yet
      const openAttendances = await Attendance.find({
        date: today,
        checkOut: { $exists: false }
      });

      console.log(`Found ${openAttendances.length} open attendances to check out.`);

      for (const attendance of openAttendances) {
        // Set checkout time to exactly 18:30 today
        const autoCheckOutTime = new Date(year, now.getMonth(), now.getDate(), 18, 30, 0);
        
        let mins = 0;
        if (attendance.checkIn) {
          const checkInTime = new Date(attendance.checkIn);
          mins = Math.floor((autoCheckOutTime - checkInTime) / (1000 * 60));
          attendance.workHours = `${Math.floor(mins / 60)}h ${mins % 60}m`;
        }

        attendance.checkOut = autoCheckOutTime;
        attendance.workStatus = 'Completed';
        attendance.lastExitTime = null;

        // If they checked in but worked less than 4 hours, mark half day
        // Otherwise it's a full day (since it's exactly 18:30 checkout, they aren't early)
        if (mins > 0 && Math.floor(mins / 60) < 4 && attendance.status !== 'Absent') {
          attendance.status = 'Half Day';
        }

        await attendance.save();
        console.log(`Auto checked out employee ${attendance.employeeId}`);
      }

      console.log('Automated check-out job completed.');
    } catch (error) {
      console.error('Error during automated check-out:', error);
    }
  });
};
