import express from 'express';
import {
  getDailyTasks,
  completeTask,
  markDailyLogin,
  getWeeklyChallenges,
  claimWeeklyReward,
  getTaskHistory,
  getRecentCompletedTasks,
  watchVideo,
} from '../controllers/taskController.js';
import {
  validateTaskCompletion,
  validateRequired,
  validateDateRangeQuery,
} from '../middleware/validation.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All task routes require authentication
router.use(protect);

// Daily tasks
router.get('/daily', getDailyTasks);
router.post('/complete', validateTaskCompletion, completeTask);
router.post('/login', markDailyLogin);
router.post('/watch-video', validateRequired(['videoId', 'duration']), watchVideo);

// Weekly challenges
router.get('/weekly', getWeeklyChallenges);
router.post('/weekly/claim', validateRequired(['challengeId']), claimWeeklyReward);

// Task history and recent activity
router.get('/history', validateDateRangeQuery, getTaskHistory);
router.get('/recent', getRecentCompletedTasks);

export default router;