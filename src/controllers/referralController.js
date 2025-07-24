import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { successResponse, getPaginationParams, getPaginationMeta } from '../utils/helpers.js';
import { generateReferralLink } from '../utils/codeGenerator.js';
import { getPendingReferralEarnings, calculateActivationImpact, getReferralChain } from '../services/referralService.js';
import { CONSTANTS } from '../utils/constants.js';

// Get user's referral information
export const getReferralInfo = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get user's referral code and stats
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referralCode: true,
      totalReferrals: true,
      userLevel: true,
    },
  });

  // Generate referral link
  const referralLink = generateReferralLink(user.referralCode);

  // Get referral statistics by level
  const referralStats = await prisma.referral.groupBy({
    by: ['level', 'earningsStatus'],
    where: { referrerId: userId },
    _count: { id: true },
    _sum: { earningsAmount: true },
  });

  // Process stats into readable format
  const stats = {
    level1: {
      count: 0,
      pendingEarnings: 0,
      confirmedEarnings: 0,
    },
    level2: {
      count: 0,
      pendingEarnings: 0,
      confirmedEarnings: 0,
    },
    level3: {
      count: 0,
      pendingEarnings: 0,
      confirmedEarnings: 0,
    },
  };

  referralStats.forEach(stat => {
    const levelKey = `level${stat.level}`;
    stats[levelKey].count += stat._count.id;
    
    if (stat.earningsStatus === CONSTANTS.EARNINGS_STATUS.PENDING) {
      stats[levelKey].pendingEarnings += Number(stat._sum.earningsAmount || 0);
    } else {
      stats[levelKey].confirmedEarnings += Number(stat._sum.earningsAmount || 0);
    }
  });

  res.json(successResponse({
    referralCode: user.referralCode,
    referralLink,
    totalReferrals: user.totalReferrals,
    userLevel: user.userLevel,
    stats,
    bonusAmounts: {
      level1: CONSTANTS.REFERRAL_BONUS.LEVEL_1,
      level2: CONSTANTS.REFERRAL_BONUS.LEVEL_2,
      level3: CONSTANTS.REFERRAL_BONUS.LEVEL_3,
    },
  }, 'Referral information retrieved successfully'));
});

// Get user's referral tree/list
export const getReferralTree = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit, skip } = getPaginationParams(req.query);
  const { level } = req.query;

  // Base query conditions
  const whereConditions = { referrerId: userId };
  
  // Filter by level if specified
  if (level && ['1', '2', '3'].includes(level)) {
    whereConditions.level = parseInt(level);
  }

  // Get total count
  const total = await prisma.referral.count({
    where: whereConditions,
  });

  // Get referrals with user information
  const referrals = await prisma.referral.findMany({
    where: whereConditions,
    include: {
      referred: {
        select: {
          phoneNumber: true,
          firstName: true,
          lastName: true,
          accountStatus: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  });

  const paginationMeta = getPaginationMeta(total, page, limit);

  res.json(successResponse({
    referrals,
    pagination: paginationMeta,
  }, 'Referral tree retrieved successfully'));
});

// Verify referral code
export const verifyReferralCode = asyncHandler(async (req, res, next) => {
  const { referralCode } = req.params;

  // Find user with this referral code
  const referrer = await prisma.user.findUnique({
    where: { referralCode },
    select: {
      id: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      userLevel: true,
      totalReferrals: true,
      accountStatus: true,
    },
  });

  if (!referrer) {
    return next(new AppError(CONSTANTS.ERRORS.REFERRAL_CODE_NOT_FOUND, 404));
  }

  // Check if referrer account is active
  if (referrer.accountStatus === CONSTANTS.ACCOUNT_STATUS.SUSPENDED) {
    return next(new AppError('Referrer account is suspended', 400));
  }

  res.json(successResponse({
    valid: true,
    referrer: {
      firstName: referrer.firstName,
      lastName: referrer.lastName,
      userLevel: referrer.userLevel,
      totalReferrals: referrer.totalReferrals,
    },
  }, 'Referral code is valid'));
});

// Get referral earnings history
export const getReferralEarnings = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit, skip } = getPaginationParams(req.query);
  const { status, level } = req.query;

  // Base query conditions
  const whereConditions = { referrerId: userId };
  
  // Filter by earnings status
  if (status && ['PENDING', 'AVAILABLE'].includes(status)) {
    whereConditions.earningsStatus = status;
  }

  // Filter by level
  if (level && ['1', '2', '3'].includes(level)) {
    whereConditions.level = parseInt(level);
  }

  // Get total count
  const total = await prisma.referral.count({
    where: whereConditions,
  });

  // Get referral earnings
  const earnings = await prisma.referral.findMany({
    where: whereConditions,
    include: {
      referred: {
        select: {
          phoneNumber: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  });

  // Calculate totals
  const totals = await prisma.referral.aggregate({
    where: { referrerId: userId },
    _sum: { earningsAmount: true },
  });

  const pendingTotal = await prisma.referral.aggregate({
    where: { 
      referrerId: userId,
      earningsStatus: CONSTANTS.EARNINGS_STATUS.PENDING,
    },
    _sum: { earningsAmount: true },
  });

  const availableTotal = await prisma.referral.aggregate({
    where: { 
      referrerId: userId,
      earningsStatus: CONSTANTS.EARNINGS_STATUS.AVAILABLE,
    },
    _sum: { earningsAmount: true },
  });

  const paginationMeta = getPaginationMeta(total, page, limit);

  res.json(successResponse({
    earnings,
    totals: {
      total: Number(totals._sum.earningsAmount || 0),
      pending: Number(pendingTotal._sum.earningsAmount || 0),
      available: Number(availableTotal._sum.earningsAmount || 0),
    },
    pagination: paginationMeta,
  }, 'Referral earnings retrieved successfully'));
});

// Get referral statistics
export const getReferralStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get monthly referral stats for the current year
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  const monthlyStats = await prisma.referral.groupBy({
    by: ['createdAt'],
    where: {
      referrerId: userId,
      createdAt: {
        gte: yearStart,
        lte: yearEnd,
      },
    },
    _count: { id: true },
    _sum: { earningsAmount: true },
  });

  // Process monthly stats
  const monthlyData = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthData = monthlyStats.filter(stat => {
      const statMonth = new Date(stat.createdAt).getMonth() + 1;
      return statMonth === month;
    });

    return {
      month,
      referrals: monthData.reduce((sum, stat) => sum + stat._count.id, 0),
      earnings: monthData.reduce((sum, stat) => sum + Number(stat._sum.earningsAmount || 0), 0),
    };
  });

  // Get top performing months
  const topMonths = monthlyData
    .filter(data => data.referrals > 0)
    .sort((a, b) => b.referrals - a.referrals)
    .slice(0, 3);

  // Get recent referrals activity
  const recentActivity = await prisma.referral.findMany({
    where: { referrerId: userId },
    include: {
      referred: {
        select: {
          firstName: true,
          lastName: true,
          accountStatus: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  res.json(successResponse({
    monthlyData,
    topMonths,
    recentActivity,
  }, 'Referral statistics retrieved successfully'));
});

// Share referral code (track sharing for daily tasks)
export const shareReferralCode = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { platform } = req.body; // 'whatsapp', 'telegram', 'sms', etc.

  // Get today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

  // Update share referral task if not already completed
  if (!dailyTask.shareReferral) {
    await prisma.dailyTask.update({
      where: { id: dailyTask.id },
      data: {
        shareReferral: true,
        completedTasksCount: {
          increment: 1,
        },
      },
    });
  }

  // Get user's referral link
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  const referralLink = generateReferralLink(user.referralCode);

  res.json(successResponse({
    shared: true,
    platform,
    referralLink,
    taskCompleted: !dailyTask.shareReferral, // Was it just completed?
  }, 'Referral code shared successfully'));
});

// Get pending referral earnings details
export const getPendingEarnings = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const pendingData = await getPendingReferralEarnings(userId);

  res.json(successResponse({
    pendingEarnings: pendingData,
    note: 'These earnings will become available when the referred users activate their accounts',
  }, 'Pending referral earnings retrieved successfully'));
});

// Get referral chain (upline and downline)
export const getChain = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const chain = await getReferralChain(userId);

  res.json(successResponse(chain, 'Referral chain retrieved successfully'));
});

// Preview activation impact (what bonuses will be processed if user activates)
export const getActivationImpact = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Verify user exists and is not activated
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      accountStatus: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
    },
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  if (user.accountStatus === CONSTANTS.ACCOUNT_STATUS.ACTIVE) {
    return next(new AppError('User is already activated', 400));
  }

  const impact = await calculateActivationImpact(userId);

  res.json(successResponse({
    user: {
      id: user.id,
      fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unknown',
      phoneNumber: user.phoneNumber,
      accountStatus: user.accountStatus,
    },
    activationImpact: impact,
  }, 'Activation impact calculated successfully'));
});