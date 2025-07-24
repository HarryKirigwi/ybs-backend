import express from 'express';
import {
  getDashboard,
  getUsers,
  getUserDetails,
  updateUserStatus,
  getWithdrawalRequests,
  processWithdrawal,
  getAnalytics,
  getSystemStats,
  createAdmin,
  getAdminUsers,
  updateAdminStatus,
  generateReport,
} from '../controllers/adminController.js';
import {
  validateUserId,
  validateWithdrawalId,
  validateUserStatusUpdate,
  validateWithdrawalResolution,
  validateAdminUserData,
  validatePaginationQuery,
  validateDateRangeQuery,
  validateRequired,
} from '../middleware/validation.js';
import { adminProtect, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// All admin routes require admin authentication
router.use(adminProtect);

// Dashboard and overview
router.get('/dashboard', getDashboard);
router.get('/analytics', validateDateRangeQuery, getAnalytics);
router.get('/system-stats', getSystemStats);
router.get('/reports', validateDateRangeQuery, generateReport);

// User management
router.get('/users', validatePaginationQuery, getUsers);
router.get('/users/:userId', validateUserId, getUserDetails);
router.put('/users/:userId/status', validateUserId, validateUserStatusUpdate, updateUserStatus);

// Withdrawal management
router.get('/withdrawals', validatePaginationQuery, getWithdrawalRequests);
router.put('/withdrawals/:withdrawalId', validateWithdrawalId, validateWithdrawalResolution, processWithdrawal);

// Super admin only routes
router.use(requireSuperAdmin);

// Admin user management
router.post('/admins', validateAdminUserData, createAdmin);
router.get('/admins', validatePaginationQuery, getAdminUsers);
router.put('/admins/:adminId/status', validateRequired(['isActive']), updateAdminStatus);

export default router;