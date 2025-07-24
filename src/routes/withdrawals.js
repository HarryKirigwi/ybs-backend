import express from 'express';
import {
  requestWithdrawal,
  getWithdrawals,
  getWithdrawal,
  cancelWithdrawal,
  getWithdrawalStats,
  getWithdrawalInfo,
  getWithdrawalMethods,
  retryWithdrawal,
} from '../controllers/withdrawalController.js';
import {
  validateWithdrawal,
  validateWithdrawalId,
  validatePaginationQuery,
} from '../middleware/validation.js';
import { protect, requireActivation } from '../middleware/auth.js';

const router = express.Router();

// All withdrawal routes require authentication
router.use(protect);

// Withdrawal information (available to all authenticated users)
router.get('/info', getWithdrawalInfo);
router.get('/methods', getWithdrawalMethods);

// Withdrawal operations (require activated account)
router.use(requireActivation);

router.post('/request', validateWithdrawal, requestWithdrawal);
router.get('/', validatePaginationQuery, getWithdrawals);
router.get('/stats', getWithdrawalStats);
router.get('/:withdrawalId', validateWithdrawalId, getWithdrawal);
router.post('/:withdrawalId/cancel', validateWithdrawalId, cancelWithdrawal);
router.post('/:withdrawalId/retry', validateWithdrawalId, retryWithdrawal);

export default router;