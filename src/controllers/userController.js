import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { successResponse, formatPhoneNumber, formatUserResponse } from '../utils/helpers.js';
import { CONSTANTS } from '../utils/constants.js';

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
  const { mpesaNumber } = req.body;
  const userId = req.user.id;

  // Check if account is already activated
  if (req.user.accountStatus === CONSTANTS.ACCOUNT_STATUS.ACTIVE) {
    return next(new AppError('Account is already activated', 400));
  }

  // Format M-Pesa number
  const formattedMpesaNumber = formatPhoneNumber(mpesaNumber);

  // In a real implementation, you would:
  // 1. Initiate M-Pesa STK push
  // 2. Wait for callback confirmation
  // 3. Update account status and create transaction

  // For now, we'll simulate the activation
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      type: CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION,
      amount: CONSTANTS.ACTIVATION_FEE,
      status: CONSTANTS.TRANSACTION_STATUS.PENDING,
      description: `Account activation fee payment via ${formattedMpesaNumber}`,
      metadata: {
        mpesaNumber: formattedMpesaNumber,
        activationFee: CONSTANTS.ACTIVATION_FEE,
      },
    },
  });

  // In production, you would wait for M-Pesa confirmation
  // For demo purposes, we'll activate immediately
  await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: CONSTANTS.ACCOUNT_STATUS.ACTIVE },
  });

  // Update transaction status
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { 
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      confirmedAt: new Date(),
    },
  });

  // Process pending referral bonuses
  const processedBonusesCount = await processPendingReferralBonuses(userId);

  res.json(successResponse({
    activated: true,
    transactionId: transaction.id,
    processedReferralBonuses: processedBonusesCount,
    message: processedBonusesCount > 0 ? 
      `Account activated! ${processedBonusesCount} referral bonuses have been processed for your referrers.` :
      'Account activated successfully!',
  }, CONSTANTS.SUCCESS.ACCOUNT_ACTIVATED));
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