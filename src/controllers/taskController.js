import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { successResponse, getStartOfDay, getWeekStart } from '../utils/helpers.js';
import { CONSTANTS } from '../utils/constants.js';

// Get today's daily tasks
export const getDailyTasks = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = getStartOfDay();

  // Find or create today's task record
  let dailyTask = await prisma.dailyTask.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  if (!dailyTask) {
    dailyTask = await prisma.dailyTask.create({
      data: {
        userId,
        date: today,
      },
    });
  }

  // Get task definitions with completion status
  const tasks = [
    {
      id: 'shareReferral',
      name: 'Share Referral Code on Social Media',
      description: 'Share your referral code on any social media platform',
      completed: dailyTask.shareReferral,
      points: 10,
    },
    {
      id: 'dailyLogin',
      name: 'Complete Daily Login',
      description: 'Log in to your account (automatically completed)',
      completed: dailyTask.dailyLogin,
      points: 5,
    },
    {
      id: 'watchVideos',
      name: 'Watch 3 Promotional Videos',
      description: `Watch ${CONSTANTS.VIDEOS_TO_WATCH} promotional videos`,
      completed: dailyTask.watchVideos,
      points: 15,
    },
    {
      id: 'inviteMember',
      name: 'Invite 1 New Member',
      description: 'Successfully refer 1 new member today',
      completed: dailyTask.inviteMember,
      points: 20,
    },
  ];

  const totalTasks = tasks.length;
  const completedCount = dailyTask.completedTasksCount;
  const completionPercentage = Math.round((completedCount / totalTasks) * 100);

  res.json(successResponse({
    tasks,
    summary: {
      totalTasks,
      completedTasks: completedCount,
      completionPercentage,
      date: today,
    },
  }, 'Daily tasks retrieved successfully'));
});

// Complete a daily task
export const completeTask = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { taskType } = req.body;
  const today = getStartOfDay();

  // Validate task type
  const validTasks = Object.values(CONSTANTS.DAILY_TASKS);
  if (!validTasks.includes(taskType)) {
    return next(new AppError('Invalid task type', 400));
  }

  // Find or create today's task record
  let dailyTask = await prisma.dailyTask.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  if (!dailyTask) {
    dailyTask = await prisma.dailyTask.create({
      data: {
        userId,
        date: today,
      },
    });
  }

  // Check if task is already completed
  if (dailyTask[taskType]) {
    return next(new AppError(CONSTANTS.ERRORS.TASK_ALREADY_COMPLETED, 400));
  }

  // Update task completion
  const updateData = {
    [taskType]: true,
    completedTasksCount: {
      increment: 1,
    },
  };

  const updatedTask = await prisma.dailyTask.update({
    where: { id: dailyTask.id },
    data: updateData,
  });

  // Check if this completes all daily tasks and award bonus if needed
  const totalTasks = Object.keys(CONSTANTS.DAILY_TASKS).length;
  if (updatedTask.completedTasksCount === totalTasks) {
    // Award daily completion bonus (if you have one)
    // This could be implemented as a separate bonus system
  }

  // Update weekly challenge progress if applicable
  await updateWeeklyChallengeProgress(userId, taskType, updatedTask.completedTasksCount);

  res.json(successResponse({
    taskType,
    completed: true,
    totalCompleted: updatedTask.completedTasksCount,
    allTasksCompleted: updatedTask.completedTasksCount === totalTasks,
  }, CONSTANTS.SUCCESS.TASK_COMPLETED));
});

// Mark daily login (called automatically on login)
export const markDailyLogin = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = getStartOfDay();

  // Find or create today's task record
  let dailyTask = await prisma.dailyTask.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  if (!dailyTask) {
    dailyTask = await prisma.dailyTask.create({
      data: {
        userId,
        date: today,
        dailyLogin: true,
        completedTasksCount: 1,
      },
    });
  } else if (!dailyTask.dailyLogin) {
    await prisma.dailyTask.update({
      where: { id: dailyTask.id },
      data: {
        dailyLogin: true,
        completedTasksCount: {
          increment: 1,
        },
      },
    });
  }

  res.json(successResponse({
    loginMarked: true,
  }, 'Daily login marked successfully'));
});

// Get weekly challenges
export const getWeeklyChallenges = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const weekStart = getWeekStart();

  // Find or create this week's challenge record
  let weeklyChallenge = await prisma.weeklyChallenge.findUnique({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate: weekStart,
      },
    },
  });

  if (!weeklyChallenge) {
    weeklyChallenge = await prisma.weeklyChallenge.create({
      data: {
        userId,
        weekStartDate: weekStart,
      },
    });
  }

  // Define challenges with progress
  const challenges = [
    {
      id: 'refer5Members',
      name: 'Refer 5 New Members',
      description: 'Successfully refer 5 new members this week',
      target: 5,
      current: weeklyChallenge.refer5Progress,
      completed: weeklyChallenge.refer5Members,
      reward: CONSTANTS.WEEKLY_CHALLENGE_BONUS,
      rewardClaimed: weeklyChallenge.rewardClaimed && weeklyChallenge.refer5Members,
    },
    {
      id: 'complete10Tasks',
      name: 'Complete 10 Daily Tasks',
      description: 'Complete 10 daily tasks this week',
      target: 10,
      current: weeklyChallenge.complete10Progress,
      completed: weeklyChallenge.complete10Tasks,
      reward: 0, // No monetary reward
      rewardClaimed: false,
    },
    {
      id: 'promote3Products',
      name: 'Promote 3 Products',
      description: 'Successfully promote 3 products this week',
      target: 3,
      current: weeklyChallenge.promote3Progress,
      completed: weeklyChallenge.promote3Products,
      reward: 0, // No monetary reward
      rewardClaimed: false,
    },
  ];

  // Calculate completion percentage for each challenge
  challenges.forEach(challenge => {
    challenge.progressPercentage = Math.min(100, Math.round((challenge.current / challenge.target) * 100));
  });

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  res.json(successResponse({
    challenges,
    weekPeriod: {
      start: weekStart,
      end: weekEnd,
    },
    totalRewardEarned: weeklyChallenge.rewardAmount || 0,
  }, 'Weekly challenges retrieved successfully'));
});

// Claim weekly challenge reward
export const claimWeeklyReward = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { challengeId } = req.body;
  const weekStart = getWeekStart();

  // Find this week's challenge record
  const weeklyChallenge = await prisma.weeklyChallenge.findUnique({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate: weekStart,
      },
    },
  });

  if (!weeklyChallenge) {
    return next(new AppError('Weekly challenge record not found', 404));
  }

  // Check if reward already claimed
  if (weeklyChallenge.rewardClaimed) {
    return next(new AppError('Weekly reward already claimed', 400));
  }

  // Validate challenge ID and check completion
  let rewardAmount = 0;
  let challengeCompleted = false;

  switch (challengeId) {
    case 'refer5Members':
      challengeCompleted = weeklyChallenge.refer5Members;
      rewardAmount = CONSTANTS.WEEKLY_CHALLENGE_BONUS;
      break;
    default:
      return next(new AppError('Invalid challenge ID or no reward available', 400));
  }

  if (!challengeCompleted) {
    return next(new AppError('Challenge not completed yet', 400));
  }

  // Update challenge record and user balance
  await prisma.$transaction(async (tx) => {
    // Update weekly challenge
    await tx.weeklyChallenge.update({
      where: { id: weeklyChallenge.id },
      data: {
        rewardClaimed: true,
        rewardAmount: rewardAmount,
      },
    });

    // Create transaction record
    await tx.transaction.create({
      data: {
        userId,
        type: CONSTANTS.TRANSACTION_TYPES.WEEKLY_CHALLENGE_BONUS,
        amount: rewardAmount,
        status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
        description: `Weekly challenge reward: ${challengeId}`,
        confirmedAt: new Date(),
      },
    });

    // Update user balance
    await tx.user.update({
      where: { id: userId },
      data: {
        availableBalance: {
          increment: rewardAmount,
        },
        totalEarned: {
          increment: rewardAmount,
        },
      },
    });
  });

  res.json(successResponse({
    challengeId,
    rewardAmount,
    claimed: true,
  }, 'Weekly challenge reward claimed successfully'));
});

// Get task history
export const getTaskHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { startDate, endDate, limit = 30 } = req.query;

  // Date range setup
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Get daily task history
  const dailyTaskHistory = await prisma.dailyTask.findMany({
    where: {
      userId,
      date: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { date: 'desc' },
    take: parseInt(limit),
  });

  // Get weekly challenge history
  const weeklyHistory = await prisma.weeklyChallenge.findMany({
    where: {
      userId,
      weekStartDate: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { weekStartDate: 'desc' },
  });

  // Calculate statistics
  const totalDaysTracked = dailyTaskHistory.length;
  const totalTasksCompleted = dailyTaskHistory.reduce((sum, day) => sum + day.completedTasksCount, 0);
  const perfectDays = dailyTaskHistory.filter(day => day.completedTasksCount === 4).length;
  const totalWeeklyRewards = weeklyHistory.reduce((sum, week) => sum + Number(week.rewardAmount || 0), 0);

  res.json(successResponse({
    dailyHistory: dailyTaskHistory,
    weeklyHistory,
    statistics: {
      totalDaysTracked,
      totalTasksCompleted,
      perfectDays,
      totalWeeklyRewards,
      averageTasksPerDay: totalDaysTracked > 0 ? Math.round((totalTasksCompleted / totalDaysTracked) * 100) / 100 : 0,
    },
  }, 'Task history retrieved successfully'));
});

// Get recent completed tasks for dashboard
export const getRecentCompletedTasks = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit = 10 } = req.query;

  // Get recent daily tasks
  const recentTasks = await prisma.dailyTask.findMany({
    where: {
      userId,
      completedTasksCount: {
        gt: 0,
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: parseInt(limit),
  });

  // Transform data to show individual completed tasks
  const completedTasks = [];
  
  recentTasks.forEach(dailyTask => {
    const tasks = [
      { type: 'shareReferral', name: 'Shared Referral Code', completed: dailyTask.shareReferral },
      { type: 'dailyLogin', name: 'Daily Login', completed: dailyTask.dailyLogin },
      { type: 'watchVideos', name: 'Watched Videos', completed: dailyTask.watchVideos },
      { type: 'inviteMember', name: 'Invited Member', completed: dailyTask.inviteMember },
    ];

    tasks.forEach(task => {
      if (task.completed) {
        completedTasks.push({
          taskType: task.type,
          taskName: task.name,
          completedAt: dailyTask.updatedAt,
          date: dailyTask.date,
        });
      }
    });
  });

  // Sort by completion time and limit
  const sortedTasks = completedTasks
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, parseInt(limit));

  res.json(successResponse({
    recentTasks: sortedTasks,
  }, 'Recent completed tasks retrieved successfully'));
});

// Update weekly challenge progress helper function
const updateWeeklyChallengeProgress = async (userId, taskType, dailyTasksCompleted) => {
  const weekStart = getWeekStart();

  // Find or create this week's challenge record
  let weeklyChallenge = await prisma.weeklyChallenge.findUnique({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate: weekStart,
      },
    },
  });

  if (!weeklyChallenge) {
    weeklyChallenge = await prisma.weeklyChallenge.create({
      data: {
        userId,
        weekStartDate: weekStart,
      },
    });
  }

  // Update weekly challenge progress based on task type
  const updateData = {};

  // Update "Complete 10 daily tasks" progress
  if (taskType === CONSTANTS.DAILY_TASKS.INVITE_MEMBER) {
    // Update "Refer 5 members" progress
    updateData.refer5Progress = {
      increment: 1,
    };
    
    // Check if challenge is completed
    if (weeklyChallenge.refer5Progress + 1 >= 5) {
      updateData.refer5Members = true;
    }
  }

  // Update daily tasks completion progress
  const currentWeekTasks = await prisma.dailyTask.count({
    where: {
      userId,
      date: {
        gte: weekStart,
        lte: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
      completedTasksCount: {
        gt: 0,
      },
    },
  });

  updateData.complete10Progress = currentWeekTasks;
  
  if (currentWeekTasks >= 10) {
    updateData.complete10Tasks = true;
  }

  // Update weekly challenge if there are changes
  if (Object.keys(updateData).length > 0) {
    await prisma.weeklyChallenge.update({
      where: { id: weeklyChallenge.id },
      data: updateData,
    });
  }
};

// Watch promotional videos (simulate video watching)
export const watchVideo = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { videoId, duration } = req.body;
  const today = getStartOfDay();

  // Validate video watching (in production, you'd validate against actual video data)
  if (!videoId || !duration || duration < 30) { // Minimum 30 seconds
    return next(new AppError('Invalid video or insufficient watch time', 400));
  }

  // Find today's task record
  let dailyTask = await prisma.dailyTask.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  if (!dailyTask) {
    dailyTask = await prisma.dailyTask.create({
      data: {
        userId,
        date: today,
      },
    });
  }

  // Check if video task is already completed
  if (dailyTask.watchVideos) {
    return next(new AppError('Video watching task already completed today', 400));
  }

  // In a real implementation, you'd track individual video views
  // For now, we'll mark the task as completed after "watching" videos
  const videosWatched = 3; // Simulate watching required videos

  if (videosWatched >= CONSTANTS.VIDEOS_TO_WATCH) {
    await prisma.dailyTask.update({
      where: { id: dailyTask.id },
      data: {
        watchVideos: true,
        completedTasksCount: {
          increment: 1,
        },
      },
    });

    // Small reward for watching videos
    const videoReward = 5; // KSH 5 per video completion
    
    await prisma.transaction.create({
      data: {
        userId,
        type: CONSTANTS.TRANSACTION_TYPES.ADS_VIEWING_BONUS,
        amount: videoReward,
        status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
        description: 'Video watching reward',
        confirmedAt: new Date(),
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        availableBalance: {
          increment: videoReward,
        },
        totalEarned: {
          increment: videoReward,
        },
      },
    });

    res.json(successResponse({
      videoWatched: true,
      taskCompleted: true,
      reward: videoReward,
    }, 'Video watching task completed successfully'));
  } else {
    res.json(successResponse({
      videoWatched: true,
      taskCompleted: false,
      videosRemaining: CONSTANTS.VIDEOS_TO_WATCH - videosWatched,
    }, 'Video watched successfully'));
  }
});