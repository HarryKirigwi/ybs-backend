import express from 'express';
import {
  register,
  login,
  adminLogin,
  verifyPhone,
  changePassword,
  refreshToken,
  getMe,
  logout,
  adminRefreshToken,
  getAdminMe,
} from '../controllers/authController.js';
import {
  validateRegistration,
  validateLogin,
  validateAdminLoginMiddleware,
  validatePhoneVerify,
  validatePasswordChangeData,
} from '../middleware/validation.js';
import { protect, adminProtect } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', validateRegistration, register);
router.post('/login', validateLogin, login);
router.post('/admin/login', validateAdminLoginMiddleware, adminLogin);
router.post('/verify-phone', validatePhoneVerify, verifyPhone);
router.post('/refresh-token', refreshToken);
router.post('/admin/refresh-token', adminRefreshToken);

// Protected routes
router.use(protect); // All routes below require authentication

router.get('/me', getMe);
router.post('/logout', logout);
router.post('/change-password', validatePasswordChangeData, changePassword);

// Admin protected routes
router.get('/admin/me', adminProtect, getAdminMe);

export default router;