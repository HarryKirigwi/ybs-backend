import express from 'express';
import {
  getEarningsSummary,
  getEarningsBreakdown,
  getEarningsHistory,
  getEarningsProjection,
} from '../controllers/earningsController.js';
import {
  validatePaginationQuery,
  validateDateRangeQuery,
} from '../middleware/validation.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All earnings routes require authentication
router.use(protect);

router.get('/summary', getEarningsSummary);
router.get('/breakdown', getEarningsBreakdown);
router.get('/history', validatePaginationQuery, getEarningsHistory);
router.get('/projection', validateDateRangeQuery, getEarningsProjection);

export default router;