import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { successResponse, getPaginationParams, getPaginationMeta, hashPassword } from '../utils/helpers.js';
import { CONSTANTS } from '../utils/constants.js';

// Get dashboard overview
export const getDashboard = asyncHandler(async (req, res) => {
  // Get today's stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get user statistics
  const totalUsers = await prisma.user.count();
  const activeUsers = await prisma.user.count({
    where: { accountStatus: CONSTANTS.ACCOUNT_STATUS.ACTIVE },
  });
  const newUsersToday = await prisma.user.count({
    where: {
      createdAt: {
        gte: today,
        lt: tomorrow,
      },
    },
  });

  // Get financial statistics
  const totalEarnings = await prisma.transaction.aggregate({
    where: {
      type: CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
    },
    _sum: { amount: true },
  });

  const totalPayouts = await prisma.transaction.aggregate({
    where: {
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
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
    },
    _sum: { amount: true },
  });

  const pendingWithdrawals = await prisma.withdrawalRequest.aggregate({
    where: {
      status: {
        in: [CONSTANTS.WITHDRAWAL_STATUS.PENDING, CONSTANTS.WITHDRAWAL_STATUS.PROCESSING],
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Get recent activity
  const recentUsers = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      accountStatus: true,
      createdAt: true,
    },
  });

  const recentWithdrawals = await prisma.withdrawalRequest.findMany({
    orderBy: { requestedAt: 'desc' },
    take: 5,
    include: {
      user: {
        select: {
          phoneNumber: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  res.json(successResponse({
    stats: {
      users: {
        total: totalUsers,
        active: activeUsers,
        newToday: newUsersToday,
        activationRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
      },
      financials: {
        totalRevenue: Number(totalEarnings._sum.amount || 0),
        totalPayouts: Number(totalPayouts._sum.amount || 0),
        profit: Number(totalEarnings._sum.amount || 0) - Number(totalPayouts._sum.amount || 0),
        pendingWithdrawals: {
          amount: Number(pendingWithdrawals._sum.amount || 0),
          count: pendingWithdrawals._count.id,
        },
      },
    },
    recentActivity: {
      users: recentUsers,
      withdrawals: recentWithdrawals,
    },
  }, 'Admin dashboard retrieved successfully'));
});

// Get all users with pagination and filters
export const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  const { status, search, level } = req.query;

  // Build filter conditions
  const whereConditions = {};

  if (status && Object.values(CONSTANTS.ACCOUNT_STATUS).includes(status)) {
    whereConditions.accountStatus = status;
  }

  if (level && ['SILVER', 'BRONZE', 'GOLD'].includes(level)) {
    whereConditions.userLevel = level;
  }

  if (search) {
    whereConditions.OR = [
      { phoneNumber: { contains: search } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { referralCode: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Get total count
  const total = await prisma.user.count({ where: whereConditions });

  // Get users
  const users = await prisma.user.findMany({
    where: whereConditions,
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
    select: {
      id: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      referralCode: true,
      accountStatus: true,
      userLevel: true,
      totalReferrals: true,
      availableBalance: true,
      totalEarned: true,
      totalWithdrawn: true,
      createdAt: true,
      lastLogin: true,
    },
  });

  const paginationMeta = getPaginationMeta(total, page, limit);

  res.json(successResponse({
    users,
    pagination: paginationMeta,
  }, 'Users retrieved successfully'));
});

// Get user details
export const getUserDetails = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      referrer: {
        select: {
          phoneNumber: true,
          firstName: true,
          lastName: true,
          referralCode: true,
        },
      },
      referrals: {
        select: {
          phoneNumber: true,
          firstName: true,
          lastName: true,
          accountStatus: true,
          createdAt: true,
        },
        take: 10,
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          amount: true,
          status: true,
          description: true,
          createdAt: true,
        },
      },
      withdrawalRequests: {
        orderBy: { requestedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          amount: true,
          status: true,
          requestedAt: true,
          resolvedAt: true,
        },
      },
    },
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Remove password hash from response
  const { passwordHash, ...userResponse } = user;

  res.json(successResponse(userResponse, 'User details retrieved successfully'));
});

// Update user status
export const updateUserStatus = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { status } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accountStatus: true },
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: status },
    select: {
      id: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      accountStatus: true,
      updatedAt: true,
    },
  });

  res.json(successResponse(updatedUser, 'User status updated successfully'));
});

// Get all withdrawal requests
export const getWithdrawalRequests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  const { status } = req.query;

  // Build filter conditions
  const whereConditions = {};

  if (status && Object.values(CONSTANTS.WITHDRAWAL_STATUS).includes(status)) {
    whereConditions.status = status;
  }

  // Get total count
  const total = await prisma.withdrawalRequest.count({ where: whereConditions });

  // Get withdrawal requests
  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: whereConditions,
    orderBy: { requestedAt: 'desc' },
    skip,
    take: limit,
    include: {
      user: {
        select: {
          phoneNumber: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const paginationMeta = getPaginationMeta(total, page, limit);

  res.json(successResponse({
    withdrawals,
    pagination: paginationMeta,
  }, 'Withdrawal requests retrieved successfully'));
});

// Process withdrawal request
export const processWithdrawal = asyncHandler(async (req, res, next) => {
  const { withdrawalId } = req.params;
  const { status, mpesaTransactionCode, rejectionReason } = req.body;
  const adminId = req.admin.id;

  // Find withdrawal request
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
    include: {
      user: {
        select: {
          id: true,
          availableBalance: true,
        },
      },
    },
  });

  if (!withdrawal) {
    return next(new AppError('Withdrawal request not found', 404));
  }

  if (withdrawal.status !== CONSTANTS.WITHDRAWAL_STATUS.PENDING) {
    return next(new AppError('Withdrawal request is not pending', 400));
  }

  // Process withdrawal in transaction
  await prisma.$transaction(async (tx) => {
    // Update withdrawal request
    const updateData = {
      status,
      adminId,
      processedAt: new Date(),
      resolvedAt: new Date(),
    };

    if (status === CONSTANTS.WITHDRAWAL_STATUS.COMPLETED) {
      updateData.mpesaTransactionCode = mpesaTransactionCode;
      
      // Update user's total withdrawn
      await tx.user.update({
        where: { id: withdrawal.userId },
        data: {
          totalWithdrawn: {
            increment: withdrawal.amount,
          },
        },
      });

      // Update transaction status
      await tx.transaction.updateMany({
        where: {
          userId: withdrawal.userId,
          type: CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA,
          metadata: {
            path: ['withdrawalRequestId'],
            equals: withdrawalId,
          },
        },
        data: {
          status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
          mpesaTransactionCode,
          confirmedAt: new Date(),
        },
      });

    } else if (status === CONSTANTS.WITHDRAWAL_STATUS.REJECTED) {
      updateData.rejectionReason = rejectionReason;
      
      // Refund amount to user's available balance
      await tx.user.update({
        where: { id: withdrawal.userId },
        data: {
          availableBalance: {
            increment: withdrawal.amount,
          },
        },
      });

      // Update transaction status
      await tx.transaction.updateMany({
        where: {
          userId: withdrawal.userId,
          type: CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA,
          metadata: {
            path: ['withdrawalRequestId'],
            equals: withdrawalId,
          },
        },
        data: {
          status: CONSTANTS.TRANSACTION_STATUS.FAILED,
        },
      });
    }

    // Update withdrawal request
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: updateData,
    });
  });

  res.json(successResponse({
    withdrawalId,
    status,
    processed: true,
  }, 'Withdrawal request processed successfully'));
});

// Get analytics data
export const getAnalytics = asyncHandler(async (req, res) => {
  const { period = 'monthly', year = new Date().getFullYear() } = req.query;

  // Get user growth data
  const userGrowth = [];
  const earningsData = [];
  const referralData = [];

  for (let i = 0; i < 12; i++) {
    const startDate = new Date(year, i, 1);
    const endDate = new Date(year, i + 1, 1);

    // User registrations
    const newUsers = await prisma.user.count({
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    // Activated users
    const activatedUsers = await prisma.user.count({
      where: {
        accountStatus: CONSTANTS.ACCOUNT_STATUS.ACTIVE,
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    // Monthly earnings
    const monthlyRevenue = await prisma.transaction.aggregate({
      where: {
        type: CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION,
        status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
        confirmedAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _sum: { amount: true },
    });

    // Monthly payouts
    const monthlyPayouts = await prisma.transaction.aggregate({
      where: {
        type: {
          in: [
            CONSTANTS.TRANSACTION_TYPES.LEVEL_1_REFERRAL_BONUS,
            CONSTANTS.TRANSACTION_TYPES.LEVEL_2_REFERRAL_BONUS,
            CONSTANTS.TRANSACTION_TYPES.LEVEL_3_REFERRAL_BONUS,
            CONSTANTS.TRANSACTION_TYPES.WEEKLY_CHALLENGE_BONUS,
            CONSTANTS.TRANSACTION_TYPES.ADS_VIEWING_BONUS,
          ],
        },
        status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
        confirmedAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _sum: { amount: true },
    });

    // Monthly referrals
    const monthlyReferrals = await prisma.referral.count({
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
    });

    userGrowth.push({
      month: i + 1,
      monthName: startDate.toLocaleString('default', { month: 'long' }),
      newUsers,
      activatedUsers,
      activationRate: newUsers > 0 ? Math.round((activatedUsers / newUsers) * 100) : 0,
    });

    earningsData.push({
      month: i + 1,
      monthName: startDate.toLocaleString('default', { month: 'long' }),
      revenue: Number(monthlyRevenue._sum.amount || 0),
      payouts: Number(monthlyPayouts._sum.amount || 0),
      profit: Number(monthlyRevenue._sum.amount || 0) - Number(monthlyPayouts._sum.amount || 0),
    });

    referralData.push({
      month: i + 1,
      monthName: startDate.toLocaleString('default', { month: 'long' }),
      referrals: monthlyReferrals,
    });
  }

  // Get top performers
  const topReferrers = await prisma.user.findMany({
    orderBy: { totalReferrals: 'desc' },
    take: 10,
    select: {
      id: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      totalReferrals: true,
      totalEarned: true,
      userLevel: true,
    },
  });

  // Get recent transactions summary
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  const recentStats = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
      createdAt: {
        gte: last30Days,
      },
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  res.json(successResponse({
    year: parseInt(year),
    userGrowth,
    earningsData,
    referralData,
    topPerformers: topReferrers,
    recentStats,
  }, 'Analytics data retrieved successfully'));
});

// Get system statistics
export const getSystemStats = asyncHandler(async (req, res) => {
  // Overall system statistics
  const totalUsers = await prisma.user.count();
  const activeUsers = await prisma.user.count({
    where: { accountStatus: CONSTANTS.ACCOUNT_STATUS.ACTIVE },
  });
  const suspendedUsers = await prisma.user.count({
    where: { accountStatus: CONSTANTS.ACCOUNT_STATUS.SUSPENDED },
  });

  // Financial statistics
  const totalRevenue = await prisma.transaction.aggregate({
    where: {
      type: CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
    },
    _sum: { amount: true },
  });

  const totalPayouts = await prisma.transaction.aggregate({
    where: {
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
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
    },
    _sum: { amount: true },
  });

  const totalWithdrawals = await prisma.withdrawalRequest.aggregate({
    where: {
      status: CONSTANTS.WITHDRAWAL_STATUS.COMPLETED,
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Referral statistics
  const totalReferrals = await prisma.referral.count();
  const activatedReferrals = await prisma.referral.count({
    where: { earningsStatus: CONSTANTS.EARNINGS_STATUS.AVAILABLE },
  });

  // User level distribution
  const userLevelStats = await prisma.user.groupBy({
    by: ['userLevel'],
    _count: { id: true },
  });

  // Daily active users (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const activeUsersLast30Days = await prisma.user.count({
    where: {
      lastLogin: {
        gte: thirtyDaysAgo,
      },
    },
  });

  res.json(successResponse({
    users: {
      total: totalUsers,
      active: activeUsers,
      suspended: suspendedUsers,
      activeLast30Days: activeUsersLast30Days,
      activationRate: totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0,
    },
    financials: {
      totalRevenue: Number(totalRevenue._sum.amount || 0),
      totalPayouts: Number(totalPayouts._sum.amount || 0),
      totalProfit: Number(totalRevenue._sum.amount || 0) - Number(totalPayouts._sum.amount || 0),
      totalWithdrawals: {
        amount: Number(totalWithdrawals._sum.amount || 0),
        count: totalWithdrawals._count.id,
      },
    },
    referrals: {
      total: totalReferrals,
      activated: activatedReferrals,
      conversionRate: totalReferrals > 0 ? Math.round((activatedReferrals / totalReferrals) * 100) : 0,
    },
    userLevels: userLevelStats.reduce((acc, stat) => {
      acc[stat.userLevel.toLowerCase()] = stat._count.id;
      return acc;
    }, {}),
  }, 'System statistics retrieved successfully'));
});

// Create admin user
export const createAdmin = asyncHandler(async (req, res, next) => {
  const { username, email, password, firstName, lastName, role = 'admin' } = req.body;

  // Check if username or email already exists
  const existingAdmin = await prisma.admin.findFirst({
    where: {
      OR: [
        { username },
        { email },
      ],
    },
  });

  if (existingAdmin) {
    return next(new AppError('Username or email already exists', 400));
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create admin
  const admin = await prisma.admin.create({
    data: {
      username,
      email,
      passwordHash: hashedPassword,
      firstName,
      lastName,
      role,
    },
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  res.status(201).json(successResponse(admin, 'Admin user created successfully'));
});

// Get all admin users
export const getAdminUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);

  const total = await prisma.admin.count();

  const admins = await prisma.admin.findMany({
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLogin: true,
    },
  });

  const paginationMeta = getPaginationMeta(total, page, limit);

  res.json(successResponse({
    admins,
    pagination: paginationMeta,
  }, 'Admin users retrieved successfully'));
});

// Update admin status
export const updateAdminStatus = asyncHandler(async (req, res, next) => {
  const { adminId } = req.params;
  const { isActive } = req.body;

  // Prevent self-deactivation
  if (adminId === req.admin.id && !isActive) {
    return next(new AppError('Cannot deactivate your own account', 400));
  }

  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
  });

  if (!admin) {
    return next(new AppError('Admin not found', 404));
  }

  const updatedAdmin = await prisma.admin.update({
    where: { id: adminId },
    data: { isActive },
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  });

  res.json(successResponse(updatedAdmin, 'Admin status updated successfully'));
});

// Generate reports
export const generateReport = asyncHandler(async (req, res, next) => {
  const { type, startDate, endDate } = req.query;

  if (!type || !startDate || !endDate) {
    return next(new AppError('Report type, start date, and end date are required', 400));
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  let reportData = {};

  switch (type) {
    case 'users':
      reportData = await generateUserReport(start, end);
      break;
    case 'financial':
      reportData = await generateFinancialReport(start, end);
      break;
    case 'referrals':
      reportData = await generateReferralReport(start, end);
      break;
    default:
      return next(new AppError('Invalid report type. Use: users, financial, or referrals', 400));
  }

  res.json(successResponse({
    type,
    period: { start, end },
    data: reportData,
    generatedAt: new Date(),
    generatedBy: req.admin.username,
  }, 'Report generated successfully'));
});

// Get daily logs for admin overview
export const getDailyLogs = asyncHandler(async (req, res) => {
  const { startDate, endDate, limit = 30 } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  const dailyLogs = await prisma.adminLog.findMany({
    where: {
      date: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { date: 'desc' },
    take: parseInt(limit),
  });

  // Calculate totals
  const totals = dailyLogs.reduce((acc, log) => ({
    newMembersActive: acc.newMembersActive + log.newMembersActive,
    newMembersInactive: acc.newMembersInactive + log.newMembersInactive,
    totalIncome: acc.totalIncome + Number(log.totalIncome),
    totalPayouts: acc.totalPayouts + Number(log.referralPayoutsL1 + log.referralPayoutsL2 + log.referralPayoutsL3 + log.commissionPayouts + log.adsPayouts + log.wheelPayouts + log.weeklyBonusPayouts),
    dailyProfit: acc.dailyProfit + Number(log.dailyProfit),
  }), {
    newMembersActive: 0,
    newMembersInactive: 0,
    totalIncome: 0,
    totalPayouts: 0,
    dailyProfit: 0,
  });

  res.json(successResponse({
    logs: dailyLogs,
    summary: {
      totalDays: dailyLogs.length,
      ...totals,
      averageDailyProfit: dailyLogs.length > 0 ? totals.dailyProfit / dailyLogs.length : 0,
    },
  }, 'Daily logs retrieved successfully'));
});

// Bulk user operations
export const bulkUserOperation = asyncHandler(async (req, res, next) => {
  const { operation, userIds, data } = req.body;

  if (!operation || !userIds || !Array.isArray(userIds)) {
    return next(new AppError('Operation and userIds array are required', 400));
  }

  let result;

  switch (operation) {
    case 'updateStatus':
      if (!data.status || !Object.values(CONSTANTS.ACCOUNT_STATUS).includes(data.status)) {
        return next(new AppError('Valid status is required', 400));
      }
      
      result = await prisma.user.updateMany({
        where: {
          id: {
            in: userIds,
          },
        },
        data: {
          accountStatus: data.status,
        },
      });
      break;

    case 'delete':
      // Soft delete by setting status to suspended
      result = await prisma.user.updateMany({
        where: {
          id: {
            in: userIds,
          },
        },
        data: {
          accountStatus: CONSTANTS.ACCOUNT_STATUS.SUSPENDED,
        },
      });
      break;

    default:
      return next(new AppError('Invalid operation. Supported: updateStatus, delete', 400));
  }

  res.json(successResponse({
    operation,
    affectedUsers: result.count,
    userIds,
  }, `Bulk ${operation} completed successfully`));
});

// Helper functions for report generation
const generateUserReport = async (startDate, endDate) => {
  const newUsers = await prisma.user.count({
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const activatedUsers = await prisma.user.count({
    where: {
      accountStatus: CONSTANTS.ACCOUNT_STATUS.ACTIVE,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const usersByLevel = await prisma.user.groupBy({
    by: ['userLevel'],
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
    _count: { id: true },
  });

  const topReferrers = await prisma.user.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
    orderBy: { totalReferrals: 'desc' },
    take: 10,
    select: {
      phoneNumber: true,
      firstName: true,
      lastName: true,
      totalReferrals: true,
      totalEarned: true,
    },
  });

  return {
    newUsers,
    activatedUsers,
    activationRate: newUsers > 0 ? Math.round((activatedUsers / newUsers) * 100) : 0,
    usersByLevel,
    topReferrers,
  };
};

const generateFinancialReport = async (startDate, endDate) => {
  const revenue = await prisma.transaction.aggregate({
    where: {
      type: CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      confirmedAt: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  const payouts = await prisma.transaction.aggregate({
    where: {
      type: {
        in: [
          CONSTANTS.TRANSACTION_TYPES.LEVEL_1_REFERRAL_BONUS,
          CONSTANTS.TRANSACTION_TYPES.LEVEL_2_REFERRAL_BONUS,
          CONSTANTS.TRANSACTION_TYPES.LEVEL_3_REFERRAL_BONUS,
          CONSTANTS.TRANSACTION_TYPES.WEEKLY_CHALLENGE_BONUS,
        ],
      },
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      confirmedAt: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  const withdrawals = await prisma.withdrawalRequest.aggregate({
    where: {
      status: CONSTANTS.WITHDRAWAL_STATUS.COMPLETED,
      resolvedAt: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Get payout breakdown by type
  const payoutBreakdown = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
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
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      confirmedAt: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  return {
    revenue: {
      amount: Number(revenue._sum.amount || 0),
      count: revenue._count.id,
    },
    payouts: {
      amount: Number(payouts._sum.amount || 0),
      count: payouts._count.id,
      breakdown: payoutBreakdown.map(item => ({
        type: item.type,
        amount: Number(item._sum.amount || 0),
        count: item._count.id,
      })),
    },
    withdrawals: {
      amount: Number(withdrawals._sum.amount || 0),
      count: withdrawals._count.id,
    },
    profit: Number(revenue._sum.amount || 0) - Number(payouts._sum.amount || 0),
    profitMargin: Number(revenue._sum.amount || 0) > 0 ? 
      Math.round(((Number(revenue._sum.amount || 0) - Number(payouts._sum.amount || 0)) / Number(revenue._sum.amount || 0)) * 100) : 0,
  };
};

const generateReferralReport = async (startDate, endDate) => {
  const totalReferrals = await prisma.referral.count({
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const referralsByLevel = await prisma.referral.groupBy({
    by: ['level'],
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
    _count: { id: true },
    _sum: { earningsAmount: true },
  });

  const activatedReferrals = await prisma.referral.count({
    where: {
      earningsStatus: CONSTANTS.EARNINGS_STATUS.AVAILABLE,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  // Get top referrers in the period
  const topReferrers = await prisma.referral.groupBy({
    by: ['referrerId'],
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
    _count: { id: true },
    orderBy: {
      _count: {
        id: 'desc',
      },
    },
    take: 10,
  });

  // Get user details for top referrers
  const topReferrerDetails = await prisma.user.findMany({
    where: {
      id: {
        in: topReferrers.map(r => r.referrerId),
      },
    },
    select: {
      id: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      totalReferrals: true,
    },
  });

  const topReferrersWithDetails = topReferrers.map(ref => {
    const user = topReferrerDetails.find(u => u.id === ref.referrerId);
    return {
      ...user,
      referralsInPeriod: ref._count.id,
    };
  });

  return {
    totalReferrals,
    activatedReferrals,
    conversionRate: totalReferrals > 0 ? Math.round((activatedReferrals / totalReferrals) * 100) : 0,
    referralsByLevel: referralsByLevel.map(item => ({
      level: item.level,
      count: item._count.id,
      totalEarnings: Number(item._sum.earningsAmount || 0),
      averageEarning: item._count.id > 0 ? Number(item._sum.earningsAmount || 0) / item._count.id : 0,
    })),
    topReferrers: topReferrersWithDetails,
  };
};

// Get company performance metrics
export const getCompanyMetrics = asyncHandler(async (req, res) => {
  const { period = 'monthly' } = req.query;
  
  // Calculate date ranges based on period
  const now = new Date();
  let startDate, previousStartDate;

  switch (period) {
    case 'daily':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 1);
      break;
    case 'weekly':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - 7);
      break;
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
      break;
    default: // monthly
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }

  const endDate = new Date();
  const previousEndDate = new Date(startDate);

  // Current period metrics
  const currentMetrics = await calculatePeriodMetrics(startDate, endDate);
  
  // Previous period metrics for comparison
  const previousMetrics = await calculatePeriodMetrics(previousStartDate, previousEndDate);

  // Calculate growth percentages
  const growthMetrics = {
    users: calculateGrowthPercentage(currentMetrics.users, previousMetrics.users),
    revenue: calculateGrowthPercentage(currentMetrics.revenue, previousMetrics.revenue),
    profit: calculateGrowthPercentage(currentMetrics.profit, previousMetrics.profit),
    referrals: calculateGrowthPercentage(currentMetrics.referrals, previousMetrics.referrals),
  };

  res.json(successResponse({
    period,
    current: currentMetrics,
    previous: previousMetrics,
    growth: growthMetrics,
    dateRange: {
      current: { start: startDate, end: endDate },
      previous: { start: previousStartDate, end: previousEndDate },
    },
  }, 'Company metrics retrieved successfully'));
});

// Helper function to calculate period metrics
const calculatePeriodMetrics = async (startDate, endDate) => {
  const users = await prisma.user.count({
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const activeUsers = await prisma.user.count({
    where: {
      accountStatus: CONSTANTS.ACCOUNT_STATUS.ACTIVE,
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const revenue = await prisma.transaction.aggregate({
    where: {
      type: CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      confirmedAt: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
  });

  const payouts = await prisma.transaction.aggregate({
    where: {
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
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      confirmedAt: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
  });

  const referrals = await prisma.referral.count({
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
  });

  const revenueAmount = Number(revenue._sum.amount || 0);
  const payoutAmount = Number(payouts._sum.amount || 0);

  return {
    users,
    activeUsers,
    activationRate: users > 0 ? Math.round((activeUsers / users) * 100) : 0,
    revenue: revenueAmount,
    payouts: payoutAmount,
    profit: revenueAmount - payoutAmount,
    profitMargin: revenueAmount > 0 ? Math.round(((revenueAmount - payoutAmount) / revenueAmount) * 100) : 0,
    referrals,
  };
};

// Helper function to calculate growth percentage
const calculateGrowthPercentage = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

// Export user data (for compliance/backup purposes)
export const exportUserData = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { format = 'json' } = req.query;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
      },
      withdrawalRequests: {
        orderBy: { requestedAt: 'desc' },
      },
      referralRelations: {
        include: {
          referred: {
            select: {
              phoneNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      referredRelations: {
        include: {
          referrer: {
            select: {
              phoneNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      dailyTasks: {
        orderBy: { date: 'desc' },
        take: 30, // Last 30 days
      },
      weeklyChallenges: {
        orderBy: { weekStartDate: 'desc' },
        take: 12, // Last 12 weeks
      },
    },
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Remove sensitive data
  const { passwordHash, ...exportData } = user;

  if (format === 'csv') {
    // Basic CSV export (you can expand this)
    const csvData = [
      'Field,Value',
      `Phone Number,${exportData.phoneNumber}`,
      `Name,${exportData.firstName || ''} ${exportData.lastName || ''}`,
      `Email,${exportData.email || ''}`,
      `Account Status,${exportData.accountStatus}`,
      `User Level,${exportData.userLevel}`,
      `Total Referrals,${exportData.totalReferrals}`,
      `Available Balance,${exportData.availableBalance}`,
      `Total Earned,${exportData.totalEarned}`,
      `Total Withdrawn,${exportData.totalWithdrawn}`,
      `Created At,${exportData.createdAt}`,
      `Last Login,${exportData.lastLogin || 'Never'}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="user_${userId}_data.csv"`);
    res.send(csvData);
  } else {
    // JSON export
    res.json(successResponse({
      userData: exportData,
      exportedAt: new Date(),
      exportedBy: req.admin.username,
    }, 'User data exported successfully'));
  }
});