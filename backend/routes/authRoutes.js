import express from 'express';
import { login, forgotPassword, verifyOtp, resetPassword } from '../controllers/authController.js';

const router = express.Router();

router.post('/login', login);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/verify-otp', verifyOtp);
router.post('/auth/reset-password', resetPassword);

export default router;
