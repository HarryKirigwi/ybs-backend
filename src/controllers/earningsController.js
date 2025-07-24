import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { successResponse, getPaginationParams, getPaginationMeta } from '../utils/helpers.js';
import { CONSTANTS } from '../utils/constants.js';

// Get earnings summary
export const getEarningsSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get user's current balances
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      pendingEarnings: true,
      availableBalance: true,
      totalEarned: true,
      totalWithdrawn: true,
    },
  });

  // Get referral earnings summary
  const referralEarnings = await prisma.referral.groupBy({
    by: ['level', 'earningsStatus'],
    where: { referrerId: userId },
    _sum: { earningsAmount: true },
    _count: { id: true },
  });

  // Process referral earnings
  const referralSummary = {
    level1: { pending: 0, available: 0, count: 0 },
    level2: { pending: 0, available: 0, count: 0 },
    level3: { pending: 0, available: 0, count: 0 },
  };

  referralEarnings.forEach(earning => {
    const level = `level${earning.level}`;
    const amount = Number(earning._sum.earningsAmount || 0);
    referralSummary[level].count += earning._count.id;
    
    if (earning.earningsStatus === CONSTANTS.EARNINGS_STATUS.PENDING) {
      referralSummary[level].pending += amount;
    } else {
      referralSummary[level].available += amount;
    }
  });

  // Get other earnings (tasks, challenges, etc.)
  const otherEarnings = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
      userId,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      type: {
        in: [
          CONSTANTS.TRANSACTION_TYPES.WEEKLY_CHALLENGE_BONUS,
          CONSTANTS.TRANSACTION_TYPES.ADS_VIEWING_BONUS,
          CONSTANTS.TRANSACTION_TYPES.WHEEL_SPIN_BONUS,
          CONSTANTS.TRANSACTION_TYPES.COMMISSION_BONUS,
          CONSTANTS.TRANSACTION_TYPES.ACADEMIC_WRITING_BONUS,
        ],
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Process other earnings
  const otherEarningsSummary = {
    weeklyChallenge: 0,
    adsViewing: 0,
    wheelSpin: 0,
    commission: 0,
    academicWriting: 0,
  };

  otherEarnings.forEach(earning => {
    const amount = Number(earning._sum.earningsAmount || 0);
    switch (earning.type) {
      case CONSTANTS.TRANSACTION_TYPES.WEEKLY_CHALLENGE_BONUS:
        otherEarningsSummary.weeklyChallenge += amount;
        break;
      case CONSTANTS.TRANSACTION_TYPES.ADS_VIEWING_BONUS:
        otherEarningsSummary.adsViewing += amount;
        break;
      case CONSTANTS.TRANSACTION_TYPES.WHEEL_SPIN_BONUS:
        otherEarningsSummary.wheelSpin += amount;
        break;
      case CONSTANTS.TRANSACTION_TYPES.COMMISSION_BONUS:
        otherEarningsSummary.commission += amount;
        break;
      case CONSTANTS.TRANSACTION_TYPES.ACADEMIC_WRITING_BONUS:
        otherEarningsSummary.academicWriting += amount;
        break;
    }
  });

  res.json(successResponse({
    balances: {
      pending: Number(user.pendingEarnings),
      available: Number(user.availableBalance),
      totalEarned: Number(user.totalEarned),
      totalWithdrawn: Number(user.totalWithdrawn),
      netEarnings: Number(user.totalEarned) - Number(user.totalWithdrawn),
    },
    referralEarnings: referralSummary,
    otherEarnings: otherEarningsSummary,
  }, 'Earnings summary retrieved successfully'));
});

// Get detailed earnings breakdown
export const getEarningsBreakdown = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { period = 'monthly' } = req.query;

  // Date range based on period
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'weekly':
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      startDate = weekStart;
      endDate = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear() + 1, 0, 1);
      break;
    default: // monthly
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  // Get confirmed earnings by category
  const earningsBreakdown = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
      userId,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
      type: {
        in: [
          CONSTANTS.TRANSACTION_TYPES.LEVEL_1_REFERRAL_BONUS,
          CONSTANTS.TRANSACTION_TYPES.LEVEL_2_REFERRAL_BONUS,
          CONSTANTS.TRANSACTION_TYPES.LEVEL_3_REFERRAL_BONUS,
          CONSTANTS.TRANSACTION_TYPES.WEEKLY_CHALLENGE_BONUS,
          CONSTANTS.TRANSACTION_TYPES.ADS_VIEWING_BONUS,
          CONSTANTS.TRANSACTION_TYPES.WHEEL_SPIN_BONUS,
          CONSTANTS.TRANSACTION_TYPES.COMMISSION_BONUS,
          CONSTANTS.TRANSACTION_TYPES.ACADEMIC_WRITING_BONUS,
        ],
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Format breakdown data
  const breakdown = earningsBreakdown.map(item => ({
    category: item.type,
    amount: Number(item._sum.amount || 0),
    count: item._count.id,
    percentage: 0, // Will be calculated after getting total
  }));

  // Calculate total and percentages
  const total = breakdown.reduce((sum, item) => sum + item.amount, 0);
  breakdown.forEach(item => {
    item.percentage = total > 0 ? Math.round((item.amount / total) * 100) : 0;
  });

  // Get daily earnings trend
  const dailyEarnings = await prisma.transaction.groupBy({
    by: ['createdAt'],
    where: {
      userId,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
      type: {
        not: CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA,
      },
    },
    _sum: { amount: true },
  });

  // Process daily trends
  const trendData = [];
  const currentDate = new Date(startDate);
  
  while (currentDate < endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayData = dailyEarnings.filter(earning => {
      return earning.createdAt.toISOString().split('T')[0] === dateStr;
    });
    
    const dayTotal = dayData.reduce((sum, d) => sum + Number(d._sum.amount || 0), 0);
    
    trendData.push({
      date: dateStr,
      amount: dayTotal,
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  res.json(successResponse({
    period,
    dateRange: {
      start: startDate,
      end: endDate,
    },
    breakdown,
    totalEarnings: total,
    dailyTrend: trendData,
  }, 'Earnings breakdown retrieved successfully'));
});

// Get earnings history with pagination
export const getEarningsHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit, skip } = getPaginationParams(req.query);
  const { type, startDate, endDate } = req.query;

  // Build filter conditions
  const whereConditions = {
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
        CONSTANTS.TRANSACTION_TYPES.ACADEMIC_WRITING_BONUS,
      ],
    },
  };

  // Filter by specific earning type
  if (type && whereConditions.type.includes(type)) {
    whereConditions.type = type;
  }

  // Filter by date range
  if (startDate || endDate) {
    whereConditions.createdAt = {};
    if (startDate) {
      whereConditions.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      whereConditions.createdAt.lte = new Date(endDate);
    }
  }

  // Get total count
  const total = await prisma.transaction.count({
    where: whereConditions,
  });

  // Get earnings history
  const earnings = await prisma.transaction.findMany({
    where: whereConditions,
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      createdAt: true,
      confirmedAt: true,
      metadata: true,
    },
  });

  const paginationMeta = getPaginationMeta(total, page, limit);

  res.json(successResponse({
    earnings,
    pagination: paginationMeta,
  }, 'Earnings history retrieved successfully'));
});

// Get earnings projection
export const getEarningsProjection = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get user's referral data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      totalReferrals: true,
      userLevel: true,
    },
  });

  // Get average monthly earnings for the last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const recentEarnings = await prisma.transaction.aggregate({
    where: {
      userId,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      createdAt: {
        gte: threeMonthsAgo,
      },
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

  const averageMonthlyEarnings = Number(recentEarnings._sum.amount || 0) / 3;

  // Calculate potential earnings based on referral growth
  const projections = {
    conservative: {
      monthlyGrowth: 0.05, // 5% monthly growth
      projectedMonthly: averageMonthlyEarnings * 1.05,
      projectedYearly: averageMonthlyEarnings * 1.05 * 12,
    },
    moderate: {
      monthlyGrowth: 0.15, // 15% monthly growth
      projectedMonthly: averageMonthlyEarnings * 1.15,
      projectedYearly: averageMonthlyEarnings * 1.15 * 12,
    },
    optimistic: {
      monthlyGrowth: 0.25, // 25% monthly growth
      projectedMonthly: averageMonthlyEarnings * 1.25,
      projectedYearly: averageMonthlyEarnings * 1.25 * 12,
    },
  };

  // Get pending referral earnings that will become available
  const pendingReferralEarnings = await prisma.referral.aggregate({
    where: {
      referrerId: userId,
      earningsStatus: CONSTANTS.EARNINGS_STATUS.PENDING,
    },
    _sum: { earningsAmount: true },
  });

  // Calculate next level benefits
  let nextLevelBenefits = null;
  const currentReferrals = user.totalReferrals;

  if (currentReferrals < 11) {
    nextLevelBenefits = {
      level: 'BRONZE',
      referralsNeeded: 11 - currentReferrals,
      benefits: ['Higher priority support', 'Exclusive promotions'],
    };
  } else if (currentReferrals < 21) {
    nextLevelBenefits = {
      level: 'GOLD',
      referralsNeeded: 21 - currentReferrals,
      benefits: ['VIP support', 'Premium promotions', 'Special bonuses'],
    };
  }

  res.json(successResponse({
    currentStats: {
      averageMonthlyEarnings,
      totalReferrals: currentReferrals,
      userLevel: user.userLevel,
      pendingEarnings: Number(pendingReferralEarnings._sum.earningsAmount || 0),
    },
    projections,
    nextLevelBenefits,
    recommendations: [
      'Focus on referring active users who will complete their activation',
      'Complete daily tasks consistently for steady earnings',
      'Participate in weekly challenges for bonus rewards',
      'Promote products to earn commission bonuses',
    ],
  }, 'Earnings projection retrieved successfully'));
});