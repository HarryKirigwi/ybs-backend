import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { successResponse, formatPhoneNumber, formatUserResponse } from '../utils/helpers.js';
import { CONSTANTS } from '../utils/constants.js';
import { activationService } from '../services/activationService.js';

// Get user profile
export const getProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      phoneNumber: true,
      email: true,
      referralCode: true,
      referredBy: true,
      accountStatus: true,
      userLevel: true,
      totalReferrals: true,
      pendingEarnings: true,
      availableBalance: true,
      totalEarned: true,
      totalWithdrawn: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      lastLogin: true,
      phoneVerified: true,
      referrer: {
        select: {
          phoneNumber: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Format user response with fullName
  const formattedUser = formatUserResponse(user);
  
  // Also format referrer if exists
  if (formattedUser.referrer) {
    formattedUser.referrer.fullName = [
      formattedUser.referrer.firstName, 
      formattedUser.referrer.lastName
    ].filter(Boolean).join(' ') || null;
  }

  res.json(successResponse(formattedUser, 'Profile retrieved successfully'));
});

// Update user profile
export const updateProfile = asyncHandler(async (req, res, next) => {
  const { firstName, lastName, email } = req.body;
  const userId = req.user.id;

  // Check if email is already taken by another user
  if (email) {
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: userId },
      },
    });

    if (existingUser) {
      return next(new AppError('Email already in use', 400));
    }
  }

  // Update user profile
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(firstName !== undefined && { firstName: firstName?.trim() || null }),
      ...(lastName !== undefined && { lastName: lastName?.trim() || null }),
      ...(email !== undefined && { email: email?.trim() || null }),
    },
    select: {
      id: true,
      phoneNumber: true,
      referralCode: true,
      accountStatus: true,
      userLevel: true,
      firstName: true,
      lastName: true,
      email: true,
      totalReferrals: true,
      pendingEarnings: true,
      availableBalance: true,
      totalEarned: true,
      totalWithdrawn: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(successResponse(updatedUser, 'Profile updated successfully'));
});

// Activate account with M-Pesa payment
export const activateAccount = asyncHandler(async (req, res, next) => {
  const { mpesaNumber, amount } = req.body;
  const userId = req.user.id;

  // Validate required fields
  if (!mpesaNumber) {
    return next(new AppError('M-Pesa number is required', 400));
  }

  if (!amount) {
    return next(new AppError('Amount is required', 400));
  }

  try {
    const result = await activationService.initiateActivation(userId, mpesaNumber, amount);
    
    res.json(successResponse({
      initiated: true,
      transactionId: result.transactionId,
      checkoutRequestId: result.checkoutRequestId,
      customerMessage: result.customerMessage,
      amount: result.amount,
      mpesaNumber: result.mpesaNumber,
    }, 'M-Pesa payment initiated. Please check your phone for the payment prompt.'));
  } catch (error) {
    return next(error);
  }
});

// Check activation status endpoint
export const checkActivationStatus = asyncHandler(async (req, res, next) => {
  const { checkoutRequestId } = req.params;
  const userId = req.user.id;

  try {
    const status = await activationService.checkActivationStatus(checkoutRequestId);
    
    // Ensure user can only check their own transactions
    if (status.transactionId && status.userId !== userId) {
      return next(new AppError('Unauthorized', 403));
    }

    res.json(successResponse(status, 'Activation status retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});

// Get user dashboard data
export const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get user data with referral information
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accountStatus: true,
      userLevel: true,
      totalReferrals: true,
      pendingEarnings: true,
      availableBalance: true,
      totalEarned: true,
      totalWithdrawn: true,
    },
  });

  // Get recent transactions
  const recentTransactions = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      type: true,
      amount: true,
      status: true,
      description: true,
      createdAt: true,
    },
  });

  // Get today's tasks
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTasks = await prisma.dailyTask.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  // Get current week's challenge
  const weekStart = getWeekStart();
  const weeklyChallenge = await prisma.weeklyChallenge.findUnique({
    where: {
      userId_weekStartDate: {
        userId,
        weekStartDate: weekStart,
      },
    },
  });

  // Get referral stats
  const referralStats = await prisma.referral.groupBy({
    by: ['level'],
    where: { referrerId: userId },
    _count: { id: true },
  });

  const referralsByLevel = {
    level1: referralStats.find(r => r.level === 1)?._count.id || 0,
    level2: referralStats.find(r => r.level === 2)?._count.id || 0,
    level3: referralStats.find(r => r.level === 3)?._count.id || 0,
  };

  res.json(successResponse({
    user,
    recentTransactions,
    todayTasks,
    weeklyChallenge,
    referralStats: referralsByLevel,
  }, 'Dashboard data retrieved successfully'));
});

// Get user statistics
export const getStatistics = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get transaction statistics
  const transactionStats = await prisma.transaction.groupBy({
    by: ['type', 'status'],
    where: { userId },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Get monthly earnings
  const monthlyEarnings = await prisma.transaction.groupBy({
    by: ['createdAt'],
    where: {
      userId,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      type: {
        in: [
          CONSTANTS.TRANSACTION_TYPES.LEVEL_1_REFERRAL_BONUS,
          CONSTANTS.TRANSACTION_TYPES.LEVEL_2_REFERRAL_BONUS,
          CONSTANTS.TRANSACTION_TYPES.LEVEL_3_REFERRAL_BONUS,
          CONSTANTS.TRANSACTION_TYPES.WEEKLY_CHALLENGE_BONUS,
          CONSTANTS.TRANSACTION_TYPES.ADS_VIEWING_BONUS,
          CONSTANTS.TRANSACTION_TYPES.WHEEL_SPIN_BONUS,
          CONSTANTS.TRANSACTION_TYPES.COMMISSION_BONUS,
        ],
      },
    },
    _sum: { amount: true },
  });

  // Get task completion stats
  const taskStats = await prisma.dailyTask.aggregate({
    where: { userId },
    _sum: {
      completedTasksCount: true,
    },
    _count: { id: true },
  });

  res.json(successResponse({
    transactionStats,
    monthlyEarnings,
    taskStats,
  }, 'Statistics retrieved successfully'));
});

// Helper function to get week start
const getWeekStart = (date = new Date()) => {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day;
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

// Helper function to process pending referral bonuses when user activates
const processPendingReferralBonuses = async (userId) => {
  // Find all pending referral bonuses for this user (where they are the referred user)
  const pendingReferrals = await prisma.referral.findMany({
    where: {
      referredId: userId,
      earningsStatus: CONSTANTS.EARNINGS_STATUS.PENDING,
    },
    include: {
      referrer: {
        select: {
          id: true,
          pendingEarnings: true,
          availableBalance: true,
          totalEarned: true,
        },
      },
    },
  });

  for (const referral of pendingReferrals) {
    await prisma.$transaction(async (tx) => {
      // Update referral status to available
      await tx.referral.update({
        where: { id: referral.id },
        data: {
          earningsStatus: CONSTANTS.EARNINGS_STATUS.AVAILABLE,
          confirmedAt: new Date(),
        },
      });

      // Create transaction record for referrer
      await tx.transaction.create({
        data: {
          userId: referral.referrerId,
          type: `LEVEL_${referral.level}_REFERRAL_BONUS`,
          amount: referral.earningsAmount,
          status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
          description: `Level ${referral.level} referral bonus from ${userId} activation`,
          confirmedAt: new Date(),
          metadata: {
            referredUserId: userId,
            referralLevel: referral.level,
            activationDate: new Date().toISOString(),
          },
        },
      });

      // Update referrer's balances
      await tx.user.update({
        where: { id: referral.referrerId },
        data: {
          pendingEarnings: {
            decrement: referral.earningsAmount, // Remove from pending
          },
          availableBalance: {
            increment: referral.earningsAmount, // Add to available
          },
          totalEarned: {
            increment: referral.earningsAmount, // Add to total earned
          },
        },
      });
    });
  }

  return pendingReferrals.length;
};