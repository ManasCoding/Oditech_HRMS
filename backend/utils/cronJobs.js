import cron from 'node-cron';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import LeaveTransaction from '../models/LeaveTransaction.js';

export const initCronJobs = () => {
  // Run every day at 18:30 (6:30 PM)
  cron.schedule('30 18 * * *', async () => {
    console.log('Running automated 6:30 PM check-out job...');
    
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${year}-${month}-${day}`;

      const openAttendances = await Attendance.find({
        date: today,
        checkOut: { $exists: false }
      });

      console.log(`Found ${openAttendances.length} open attendances to check out.`);

      for (const attendance of openAttendances) {
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

  // ── Monthly Earned Leave Accrual ─────────────────────────────────────────────────
  // Runs on the 1st of every month at 01:00 AM
  // Processes the PREVIOUS completed month for all active employees
  cron.schedule('0 1 1 * *', async () => {
    console.log('Running monthly earned leave accrual job...');
    try {
      const now = new Date();
      const targetDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const accrualMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

      const employees = await Employee.find({ status: 'Active' });
      let processed = 0, skipped = 0;

      for (const emp of employees) {
        const joinDate = new Date(emp.joinDate || emp.createdAt);
        const joinMonth = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}`;
        if (accrualMonth < joinMonth) { skipped++; continue; }

        try {
          const existing = await LeaveTransaction.findOne({
            employeeId: emp._id,
            accrualMonth,
            transactionType: 'MONTHLY_ACCRUAL'
          });
          if (existing) { skipped++; continue; }

          // Compute current balance
          const balanceResult = await LeaveTransaction.aggregate([
            { $match: { employeeId: emp._id } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]);
          const currentBalance = balanceResult.length > 0 ? balanceResult[0].total : 0;

          await LeaveTransaction.create({
            employeeId: emp._id,
            transactionType: 'MONTHLY_ACCRUAL',
            amount: 1,
            accrualMonth,
            leaveType: 'Earned Leave',
            reason: `Monthly earned leave accrual for ${accrualMonth}`,
            balanceAfterTransaction: currentBalance + 1,
            createdBy: null
          });
          processed++;
        } catch (err) {
          if (err.code === 11000) { skipped++; }
          else { console.error(`Accrual error for ${emp.empCode}:`, err.message); }
        }
      }
      console.log(`Monthly accrual for ${accrualMonth}: processed=${processed}, skipped=${skipped}`);
    } catch (error) {
      console.error('Monthly accrual cron error:', error);
    }
  });
  // ───────────────────────────────────────────────────────────────────────
};
