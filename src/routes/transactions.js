import express from 'express';
import {
  getTransactions,
  getTransaction,
  getTransactionStats,
  getMonthlyTransactionSummary,
  getTransactionTypes,
  exportTransactions,
} from '../controllers/transactionController.js';
import {
  validateTransactionId,
  validatePaginationQuery,
  validateDateRangeQuery,
} from '../middleware/validation.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All transaction routes require authentication
router.use(protect);

// Transaction routes
router.get('/', validatePaginationQuery, getTransactions);
router.get('/types', getTransactionTypes);
router.get('/stats', getTransactionStats);
router.get('/monthly-summary', getMonthlyTransactionSummary);
router.get('/export', validateDateRangeQuery, exportTransactions);
router.get('/:transactionId', validateTransactionId, getTransaction);

export default router;