import express from 'express';
import {
  getReferralInfo,
  getReferralTree,
  verifyReferralCode,
  getReferralEarnings,
  getReferralStats,
  shareReferralCode,
  getPendingEarnings,
  getChain,
  getActivationImpact,
} from '../controllers/referralController.js';
import {
  validateReferralCode,
  validatePaginationQuery,
  validateDateRangeQuery,
  validateRequired,
} from '../middleware/validation.js';
import { protect, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/verify/:referralCode', validateReferralCode, verifyReferralCode);

// Protected routes
router.use(protect);

// Referral information
router.get('/info', getReferralInfo);
router.get('/tree', validatePaginationQuery, getReferralTree);
router.get('/earnings', validatePaginationQuery, getReferralEarnings);
router.get('/pending', getPendingEarnings);
router.get('/chain', getChain);
router.get('/stats', getReferralStats);
router.get('/activation-impact/:userId', getActivationImpact);

// Referral actions
router.post('/share', validateRequired(['platform']), shareReferralCode);

export default router;