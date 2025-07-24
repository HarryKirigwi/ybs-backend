import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { successResponse, getPaginationParams, getPaginationMeta, formatPhoneNumber } from '../utils/helpers.js';
import { CONSTANTS } from '../utils/constants.js';

// Request withdrawal
export const requestWithdrawal = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { amount, mpesaNumber } = req.body;

  // Check if account is activated
  if (req.user.accountStatus !== CONSTANTS.ACCOUNT_STATUS.ACTIVE) {
    return next(new AppError(CONSTANTS.ERRORS.ACCOUNT_NOT_ACTIVATED, 403));
  }

  // Validate withdrawal amount
  const withdrawalAmount = parseFloat(amount);
  if (withdrawalAmount < CONSTANTS.MIN_WITHDRAWAL_AMOUNT) {
    return next(new AppError(CONSTANTS.ERRORS.MIN_WITHDRAWAL, 400));
  }

  // Check if user has sufficient balance
  if (req.user.availableBalance < withdrawalAmount) {
    return next(new AppError(CONSTANTS.ERRORS.INSUFFICIENT_BALANCE, 400));
  }

  // Format M-Pesa number
  const formattedMpesaNumber = formatPhoneNumber(mpesaNumber);

  // Check for pending withdrawal requests
  const pendingWithdrawal = await prisma.withdrawalRequest.findFirst({
    where: {
      userId,
      status: {
        in: [CONSTANTS.WITHDRAWAL_STATUS.PENDING, CONSTANTS.WITHDRAWAL_STATUS.PROCESSING],
      },
    },
  });

  if (pendingWithdrawal) {
    return next(new AppError('You already have a pending withdrawal request', 400));
  }

  // Create withdrawal request and update user balance in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create withdrawal request
    const withdrawalRequest = await tx.withdrawalRequest.create({
      data: {
        userId,
        amount: withdrawalAmount,
        mpesaNumber: formattedMpesaNumber,
        status: CONSTANTS.WITHDRAWAL_STATUS.PENDING,
      },
    });

    // Deduct amount from available balance
    await tx.user.update({
      where: { id: userId },
      data: {
        availableBalance: {
          decrement: withdrawalAmount,
        },
      },
    });

    // Create transaction record
    await tx.transaction.create({
      data: {
        userId,
        type: CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA,
        amount: withdrawalAmount,
        status: CONSTANTS.TRANSACTION_STATUS.PENDING,
        description: `Withdrawal request to ${formattedMpesaNumber}`,
        metadata: {
          withdrawalRequestId: withdrawalRequest.id,
          mpesaNumber: formattedMpesaNumber,
        },
      },
    });

    return withdrawalRequest;
  });

  res.json(successResponse({
    withdrawalRequest: result,
  }, CONSTANTS.SUCCESS.WITHDRAWAL_REQUESTED));
});

// Get user's withdrawal requests
export const getWithdrawals = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit, skip } = getPaginationParams(req.query);
  const { status } = req.query;

  // Build filter conditions
  const whereConditions = { userId };

  if (status && Object.values(CONSTANTS.WITHDRAWAL_STATUS).includes(status)) {
    whereConditions.status = status;
  }

  // Get total count
  const total = await prisma.withdrawalRequest.count({
    where: whereConditions,
  });

  // Get withdrawal requests
  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: whereConditions,
    orderBy: { requestedAt: 'desc' },
    skip,
    take: limit,
    select: {
      id: true,
      amount: true,
      mpesaNumber: true,
      status: true,
      rejectionReason: true,
      mpesaTransactionCode: true,
      requestedAt: true,
      processedAt: true,
      resolvedAt: true,
    },
  });

  const paginationMeta = getPaginationMeta(total, page, limit);

  res.json(successResponse({
    withdrawals,
    pagination: paginationMeta,
  }, 'Withdrawal requests retrieved successfully'));
});

// Get withdrawal by ID
export const getWithdrawal = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { withdrawalId } = req.params;

  const withdrawal = await prisma.withdrawalRequest.findFirst({
    where: {
      id: withdrawalId,
      userId,
    },
    select: {
      id: true,
      amount: true,
      mpesaNumber: true,
      status: true,
      rejectionReason: true,
      mpesaTransactionCode: true,
      requestedAt: true,
      processedAt: true,
      resolvedAt: true,
    },
  });

  if (!withdrawal) {
    return next(new AppError('Withdrawal request not found', 404));
  }

  res.json(successResponse(withdrawal, 'Withdrawal request retrieved successfully'));
});

// Cancel withdrawal request (only if pending)
export const cancelWithdrawal = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { withdrawalId } = req.params;

  // Find withdrawal request
  const withdrawal = await prisma.withdrawalRequest.findFirst({
    where: {
      id: withdrawalId,
      userId,
    },
  });

  if (!withdrawal) {
    return next(new AppError('Withdrawal request not found', 404));
  }

  // Check if withdrawal can be cancelled
  if (withdrawal.status !== CONSTANTS.WITHDRAWAL_STATUS.PENDING) {
    return next(new AppError('Cannot cancel withdrawal request that is not pending', 400));
  }

  // Cancel withdrawal and refund balance
  await prisma.$transaction(async (tx) => {
    // Update withdrawal status
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: CONSTANTS.WITHDRAWAL_STATUS.REJECTED,
        rejectionReason: 'Cancelled by user',
        resolvedAt: new Date(),
      },
    });

    // Refund amount to available balance
    await tx.user.update({
      where: { id: userId },
      data: {
        availableBalance: {
          increment: withdrawal.amount,
        },
      },
    });

    // Update transaction status
    await tx.transaction.updateMany({
      where: {
        userId,
        type: CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA,
        metadata: {
          path: ['withdrawalRequestId'],
          equals: withdrawalId,
        },
      },
      data: {
        status: CONSTANTS.TRANSACTION_STATUS.CANCELLED,
      },
    });
  });

  res.json(successResponse({
    cancelled: true,
  }, 'Withdrawal request cancelled successfully'));
});

// Get withdrawal statistics
export const getWithdrawalStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Get withdrawal statistics
  const stats = await prisma.withdrawalRequest.groupBy({
    by: ['status'],
    where: { userId },
    _sum: { amount: true },
    _count: { id: true },
  });

  // Get monthly withdrawal trends
  const currentYear = new Date().getFullYear();
  const monthlyTrends = [];

  for (let month = 0; month < 12; month++) {
    const startDate = new Date(currentYear, month, 1);
    const endDate = new Date(currentYear, month + 1, 1);

    const monthlyWithdrawals = await prisma.withdrawalRequest.aggregate({
      where: {
        userId,
        status: CONSTANTS.WITHDRAWAL_STATUS.COMPLETED,
        resolvedAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    monthlyTrends.push({
      month: month + 1,
      monthName: startDate.toLocaleString('default', { month: 'long' }),
      amount: Number(monthlyWithdrawals._sum.amount || 0),
      count: monthlyWithdrawals._count.id,
    });
  }

  // Get recent withdrawal activity
  const recentActivity = await prisma.withdrawalRequest.findMany({
    where: { userId },
    orderBy: { requestedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      amount: true,
      status: true,
      requestedAt: true,
      resolvedAt: true,
    },
  });

  // Calculate totals
  const totalRequested = stats.reduce((sum, stat) => sum + Number(stat._sum.amount || 0), 0);
  const totalCompleted = stats.find(s => s.status === CONSTANTS.WITHDRAWAL_STATUS.COMPLETED)?._sum.amount || 0;
  const totalPending = stats.find(s => s.status === CONSTANTS.WITHDRAWAL_STATUS.PENDING)?._sum.amount || 0;

  res.json(successResponse({
    summary: {
      totalRequested,
      totalCompleted: Number(totalCompleted),
      totalPending: Number(totalPending),
      totalRequests: stats.reduce((sum, stat) => sum + stat._count.id, 0),
    },
    stats,
    monthlyTrends,
    recentActivity,
  }, 'Withdrawal statistics retrieved successfully'));
});

// Get withdrawal limits and info
export const getWithdrawalInfo = asyncHandler(async (req, res) => {
  const user = req.user;

  // Calculate daily withdrawal limit (you can customize this logic)
  const dailyLimit = 50000; // KSH 50,000 daily limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get today's completed withdrawals
  const todayWithdrawals = await prisma.withdrawalRequest.aggregate({
    where: {
      userId: user.id,
      status: CONSTANTS.WITHDRAWAL_STATUS.COMPLETED,
      resolvedAt: {
        gte: today,
        lt: tomorrow,
      },
    },
    _sum: { amount: true },
  });

  const todayWithdrawn = Number(todayWithdrawals._sum.amount || 0);
  const remainingDailyLimit = Math.max(0, dailyLimit - todayWithdrawn);

  // Get processing times (average)
  const avgProcessingTime = await getAverageProcessingTime(user.id);

  res.json(successResponse({
    limits: {
      minimum: CONSTANTS.MIN_WITHDRAWAL_AMOUNT,
      dailyLimit,
      remainingDaily: remainingDailyLimit,
      maxPerRequest: Math.min(user.availableBalance, remainingDailyLimit),
    },
    availableBalance: Number(user.availableBalance),
    processing: {
      averageTimeHours: avgProcessingTime,
      businessHours: '9:00 AM - 5:00 PM EAT',
      weekdays: 'Monday - Friday',
      note: 'Withdrawals are processed during business hours',
    },
    requirements: [
      'Account must be activated',
      'Valid M-Pesa number required',
      `Minimum withdrawal: KSH ${CONSTANTS.MIN_WITHDRAWAL_AMOUNT}`,
      'Sufficient available balance',
      'No pending withdrawal requests',
    ],
  }, 'Withdrawal information retrieved successfully'));
});

// Helper function to calculate average processing time
const getAverageProcessingTime = async (userId) => {
  const completedWithdrawals = await prisma.withdrawalRequest.findMany({
    where: {
      userId,
      status: CONSTANTS.WITHDRAWAL_STATUS.COMPLETED,
      requestedAt: { not: null },
      resolvedAt: { not: null },
    },
    select: {
      requestedAt: true,
      resolvedAt: true,
    },
    take: 10, // Last 10 withdrawals
  });

  if (completedWithdrawals.length === 0) {
    return 24; // Default 24 hours if no history
  }

  const totalHours = completedWithdrawals.reduce((sum, withdrawal) => {
    const timeDiff = withdrawal.resolvedAt - withdrawal.requestedAt;
    const hours = timeDiff / (1000 * 60 * 60); // Convert to hours
    return sum + hours;
  }, 0);

  return Math.round(totalHours / completedWithdrawals.length);
};

// Get withdrawal methods and fees
export const getWithdrawalMethods = asyncHandler(async (req, res) => {
  const methods = [
    {
      id: 'mpesa',
      name: 'M-Pesa',
      description: 'Withdraw directly to your M-Pesa account',
      fees: {
        percentage: 0,
        fixed: 0,
        description: 'No withdrawal fees',
      },
      limits: {
        minimum: CONSTANTS.MIN_WITHDRAWAL_AMOUNT,
        maximum: 50000,
        daily: 50000,
      },
      processingTime: '1-24 hours',
      availability: '24/7',
      requirements: [
        'Valid M-Pesa registered phone number',
        'Phone number must match account holder',
      ],
      isAvailable: true,
      isDefault: true,
    },
  ];

  res.json(successResponse({
    methods,
    defaultMethod: 'mpesa',
    note: 'Currently only M-Pesa withdrawals are supported',
  }, 'Withdrawal methods retrieved successfully'));
});

// Retry failed withdrawal (admin function, but can be called by user for pending)
export const retryWithdrawal = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { withdrawalId } = req.params;

  // Find withdrawal request
  const withdrawal = await prisma.withdrawalRequest.findFirst({
    where: {
      id: withdrawalId,
      userId,
    },
  });

  if (!withdrawal) {
    return next(new AppError('Withdrawal request not found', 404));
  }

  // Only allow retry for rejected requests
  if (withdrawal.status !== CONSTANTS.WITHDRAWAL_STATUS.REJECTED) {
    return next(new AppError('Can only retry rejected withdrawal requests', 400));
  }

  // Check if user still has sufficient balance (in case they made other transactions)
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { availableBalance: true },
  });

  if (currentUser.availableBalance < withdrawal.amount) {
    return next(new AppError('Insufficient balance to retry withdrawal', 400));
  }

  // Reset withdrawal to pending and deduct balance again
  await prisma.$transaction(async (tx) => {
    // Update withdrawal status
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: CONSTANTS.WITHDRAWAL_STATUS.PENDING,
        rejectionReason: null,
        processedAt: null,
        resolvedAt: null,
      },
    });

    // Deduct amount from available balance
    await tx.user.update({
      where: { id: userId },
      data: {
        availableBalance: {
          decrement: withdrawal.amount,
        },
      },
    });

    // Update transaction status
    await tx.transaction.updateMany({
      where: {
        userId,
        type: CONSTANTS.TRANSACTION_TYPES.WITHDRAW_TO_MPESA,
        metadata: {
          path: ['withdrawalRequestId'],
          equals: withdrawalId,
        },
      },
      data: {
        status: CONSTANTS.TRANSACTION_STATUS.PENDING,
      },
    });
  });

  res.json(successResponse({
    retried: true,
    withdrawalId,
  }, 'Withdrawal request retried successfully'));
});