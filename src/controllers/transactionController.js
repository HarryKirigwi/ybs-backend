import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { successResponse, getPaginationParams, getPaginationMeta } from '../utils/helpers.js';
import { CONSTANTS } from '../utils/constants.js';

// Get user transactions
export const getTransactions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit, skip } = getPaginationParams(req.query);
  const { type, status, startDate, endDate } = req.query;

  // Build filter conditions
  const whereConditions = { userId };

  // Filter by transaction type
  if (type && Object.values(CONSTANTS.TRANSACTION_TYPES).includes(type)) {
    whereConditions.type = type;
  }

  // Filter by status
  if (status && Object.values(CONSTANTS.TRANSACTION_STATUS).includes(status)) {
    whereConditions.status = status;
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

  // Get transactions
  const transactions = await prisma.transaction.findMany({
    where: whereConditions,
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
    select: {
      id: true,
      type: true,
      amount: true,
      status: true,
      description: true,
      mpesaTransactionCode: true,
      createdAt: true,
      confirmedAt: true,
      metadata: true,
    },
  });

  const paginationMeta = getPaginationMeta(total, page, limit);

  res.json(successResponse({
    transactions,
    pagination: paginationMeta,
  }, 'Transactions retrieved successfully'));
});

// Get transaction by ID
export const getTransaction = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { transactionId } = req.params;

  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      userId,
    },
    select: {
      id: true,
      type: true,
      amount: true,
      status: true,
      description: true,
      mpesaTransactionCode: true,
      createdAt: true,
      confirmedAt: true,
      metadata: true,
    },
  });

  if (!transaction) {
    return next(new AppError('Transaction not found', 404));
  }

  res.json(successResponse(transaction, 'Transaction retrieved successfully'));
});

// Get transaction statistics
export const getTransactionStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { period = 'monthly' } = req.query; // daily, weekly, monthly, yearly

  // Date range based on period
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'daily':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      break;
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

  // Get transaction statistics
  const stats = await prisma.transaction.groupBy({
    by: ['type', 'status'],
    where: {
      userId,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Get earnings by type (only confirmed transactions)
  const earningsByType = await prisma.transaction.groupBy({
    by: ['type'],
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
          CONSTANTS.TRANSACTION_TYPES.ACADEMIC_WRITING_BONUS,
        ],
      },
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Get total earnings and withdrawals
  const totalEarnings = await prisma.transaction.aggregate({
    where: {
      userId,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      type: {
        not: CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA,
      },
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    _sum: { amount: true },
  });

  const totalWithdrawals = await prisma.transaction.aggregate({
    where: {
      userId,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      type: CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    _sum: { amount: true },
  });

  // Get daily transaction trends for charts
  const dailyTrends = await prisma.transaction.groupBy({
    by: ['createdAt'],
    where: {
      userId,
      status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Process daily trends into chart-friendly format
  const trendData = [];
  const currentDate = new Date(startDate);
  
  while (currentDate < endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayData = dailyTrends.filter(trend => {
      return trend.createdAt.toISOString().split('T')[0] === dateStr;
    });
    
    const dayTotal = dayData.reduce((sum, d) => sum + Number(d._sum.amount || 0), 0);
    const dayCount = dayData.reduce((sum, d) => sum + d._count.id, 0);
    
    trendData.push({
      date: dateStr,
      amount: dayTotal,
      count: dayCount,
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }

  res.json(successResponse({
    period,
    dateRange: {
      start: startDate,
      end: endDate,
    },
    summary: {
      totalEarnings: Number(totalEarnings._sum.amount || 0),
      totalWithdrawals: Number(totalWithdrawals._sum.amount || 0),
      netEarnings: Number(totalEarnings._sum.amount || 0) - Number(totalWithdrawals._sum.amount || 0),
    },
    stats,
    earningsByType,
    dailyTrends: trendData,
  }, 'Transaction statistics retrieved successfully'));
});

// Get monthly transaction summary
export const getMonthlyTransactionSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { year = new Date().getFullYear() } = req.query;

  const monthlySummary = [];

  for (let month = 0; month < 12; month++) {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 1);

    // Get earnings for the month
    const earnings = await prisma.transaction.aggregate({
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
            CONSTANTS.TRANSACTION_TYPES.ACADEMIC_WRITING_BONUS,
          ],
        },
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    // Get withdrawals for the month
    const withdrawals = await prisma.transaction.aggregate({
      where: {
        userId,
        status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
        type: CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA,
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    monthlySummary.push({
      month: month + 1,
      monthName: startDate.toLocaleString('default', { month: 'long' }),
      earnings: {
        amount: Number(earnings._sum.amount || 0),
        count: earnings._count.id,
      },
      withdrawals: {
        amount: Number(withdrawals._sum.amount || 0),
        count: withdrawals._count.id,
      },
      net: Number(earnings._sum.amount || 0) - Number(withdrawals._sum.amount || 0),
    });
  }

  // Calculate yearly totals
  const yearlyTotals = monthlySummary.reduce((acc, month) => ({
    totalEarnings: acc.totalEarnings + month.earnings.amount,
    totalWithdrawals: acc.totalWithdrawals + month.withdrawals.amount,
    totalNet: acc.totalNet + month.net,
    totalTransactions: acc.totalTransactions + month.earnings.count + month.withdrawals.count,
  }), {
    totalEarnings: 0,
    totalWithdrawals: 0,
    totalNet: 0,
    totalTransactions: 0,
  });

  res.json(successResponse({
    year: parseInt(year),
    monthlySummary,
    yearlyTotals,
  }, 'Monthly transaction summary retrieved successfully'));
});

// Get transaction types and their descriptions
export const getTransactionTypes = asyncHandler(async (req, res) => {
  const transactionTypes = Object.entries(CONSTANTS.TRANSACTION_TYPES).map(([key, value]) => {
    let description = '';
    let category = 'other';
    let isEarning = true;

    switch (value) {
      case CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION:
        description = 'Account activation fee payment';
        category = 'activation';
        isEarning = false;
        break;
      case CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA:
        description = 'Withdrawal to M-Pesa account';
        category = 'withdrawal';
        isEarning = false;
        break;
      case CONSTANTS.TRANSACTION_TYPES.LEVEL_1_REFERRAL_BONUS:
        description = 'Direct referral bonus (Level 1)';
        category = 'referral';
        break;
      case CONSTANTS.TRANSACTION_TYPES.LEVEL_2_REFERRAL_BONUS:
        description = 'Level 2 referral bonus';
        category = 'referral';
        break;
      case CONSTANTS.TRANSACTION_TYPES.LEVEL_3_REFERRAL_BONUS:
        description = 'Level 3 referral bonus';
        category = 'referral';
        break;
      case CONSTANTS.TRANSACTION_TYPES.WEEKLY_CHALLENGE_BONUS:
        description = 'Weekly challenge completion bonus';
        category = 'challenge';
        break;
      case CONSTANTS.TRANSACTION_TYPES.ADS_VIEWING_BONUS:
        description = 'Advertisement viewing reward';
        category = 'task';
        break;
      case CONSTANTS.TRANSACTION_TYPES.WHEEL_SPIN_BONUS:
        description = 'Wheel spin reward';
        category = 'game';
        break;
      case CONSTANTS.TRANSACTION_TYPES.COMMISSION_BONUS:
        description = 'Product promotion commission';
        category = 'commission';
        break;
      case CONSTANTS.TRANSACTION_TYPES.ACADEMIC_WRITING_BONUS:
        description = 'Academic writing service commission';
        category = 'service';
        break;
    }

    return {
      key,
      value,
      description,
      category,
      isEarning,
    };
  });

  res.json(successResponse({
    transactionTypes,
    categories: {
      activation: 'Account Activation',
      withdrawal: 'Withdrawals',
      referral: 'Referral Bonuses',
      challenge: 'Challenge Rewards',
      task: 'Task Rewards',
      game: 'Game Rewards',
      commission: 'Product Commissions',
      service: 'Service Commissions',
    },
  }, 'Transaction types retrieved successfully'));
});

// Export transactions to CSV (basic implementation)
export const exportTransactions = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { startDate, endDate, type, status } = req.query;

  // Build filter conditions
  const whereConditions = { userId };

  if (type && Object.values(CONSTANTS.TRANSACTION_TYPES).includes(type)) {
    whereConditions.type = type;
  }

  if (status && Object.values(CONSTANTS.TRANSACTION_STATUS).includes(status)) {
    whereConditions.status = status;
  }

  if (startDate || endDate) {
    whereConditions.createdAt = {};
    if (startDate) {
      whereConditions.createdAt.gte = new Date(startDate);
    }
    if (endDate) {
      whereConditions.createdAt.lte = new Date(endDate);
    }
  }

  // Get transactions
  const transactions = await prisma.transaction.findMany({
    where: whereConditions,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      amount: true,
      status: true,
      description: true,
      mpesaTransactionCode: true,
      createdAt: true,
      confirmedAt: true,
    },
  });

  if (transactions.length === 0) {
    return next(new AppError('No transactions found for export', 404));
  }

  // Convert to CSV format (basic implementation)
  const csvHeader = 'ID,Type,Amount,Status,Description,M-Pesa Code,Created Date,Confirmed Date\n';
  const csvRows = transactions.map(t => 
    `"${t.id}","${t.type}","${t.amount}","${t.status}","${t.description || ''}","${t.mpesaTransactionCode || ''}","${t.createdAt.toISOString()}","${t.confirmedAt ? t.confirmedAt.toISOString() : ''}"`
  ).join('\n');

  const csvContent = csvHeader + csvRows;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(csvContent);
});