import express from 'express';
import {
  getProfile,
  updateProfile,
  activateAccount,
  getDashboard,
  getStatistics,
  checkActivationStatus,
} from '../controllers/userController.js';
import {
  validateProfileUpdateData,
  validateActivation,
  validatePaginationQuery,
} from '../middleware/validation.js';
import { protect, requireActivation } from '../middleware/auth.js';

const router = express.Router();

// All user routes require authentication
router.use(protect);

// Profile routes
router.get('/profile', getProfile);
router.put('/profile', validateProfileUpdateData, updateProfile);

// Account activation
router.post('/activate', validateActivation, activateAccount);
router.get('/activation-status/:checkoutRequestId', checkActivationStatus);

// Dashboard and statistics
router.get('/dashboard', getDashboard);
router.get('/statistics', validatePaginationQuery, getStatistics);

export default router;