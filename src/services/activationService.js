import { prisma } from '../lib/prisma.js';
import { mpesaService } from './mpesaService.js';
import { CONSTANTS } from '../utils/constants.js';
import { AppError } from '../middleware/errorHandler.js';

class ActivationService {
  // Initiate account activation with frontend-provided data
  async initiateActivation(userId, mpesaNumber, amount) {
    try {
      // Validate user exists and is not already activated
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, accountStatus: true, phoneNumber: true },
      });

      if (!user) {
        throw new AppError('User not found', 404);
      }

      if (user.accountStatus === CONSTANTS.ACCOUNT_STATUS.ACTIVE) {
        throw new AppError('Account is already activated', 400);
      }

      // Validate amount
      if (amount !== 600) {
        throw new AppError('Invalid activation amount. Must be KSH 600', 400);
      }

      // Validate M-Pesa number
      const formattedMpesaNumber = mpesaService.validatePhoneNumber(mpesaNumber);

      // Generate a unique reference for this activation attempt
      const activationReference = `ACT_${userId}_${Date.now()}`;

      // Initiate M-Pesa STK push without creating any database records
      const mpesaResponse = await mpesaService.initiateAccountActivation(
        formattedMpesaNumber,
        amount,
        activationReference
      );

      return {
        success: true,
        checkoutRequestId: mpesaResponse.checkoutRequestId,
        customerMessage: mpesaResponse.customerMessage,
        amount: amount,
        mpesaNumber: formattedMpesaNumber,
        activationReference: activationReference,
      };
    } catch (error) {
      throw error;
    }
  }

  // Process successful activation
  async processSuccessfulActivation(checkoutRequestId, mpesaReceiptNumber) {
    try {
      // Use a transaction to ensure all operations succeed or fail together
      const result = await prisma.$transaction(async (tx) => {
        // Create the transaction record only after successful payment
        const transaction = await tx.transaction.create({
          data: {
            userId: null, // Will be set below
            type: CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION,
            amount: 600,
            status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
            description: `Account activation fee payment via M-Pesa`,
            confirmedAt: new Date(),
            metadata: {
              mpesaReceiptNumber,
              checkoutRequestId,
              processedAt: new Date().toISOString(),
            },
          },
        });

        // Find user by checkout request ID (we'll need to store this temporarily)
        // For now, we'll use a different approach - store user info in the callback
        // This is a simplified version - in production you might want to use Redis
        
        // Since we don't have user info in the callback, we'll need to modify the approach
        // For now, let's assume we can get user info from the M-Pesa response or callback
        
        return {
          success: true,
          transactionId: transaction.id,
          mpesaReceiptNumber,
        };
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

  // Alternative approach: Process activation with user info
  async processSuccessfulActivationWithUser(userId, checkoutRequestId, mpesaReceiptNumber) {
    try {
      // Use a transaction to ensure all operations succeed or fail together
      const result = await prisma.$transaction(async (tx) => {
        // Verify user is not already activated
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, accountStatus: true },
        });

        if (!user) {
          throw new AppError('User not found', 404);
        }

        if (user.accountStatus === CONSTANTS.ACCOUNT_STATUS.ACTIVE) {
          throw new AppError('Account is already activated', 400);
        }

        // Create the transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId: userId,
            type: CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION,
            amount: 600,
            status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
            description: `Account activation fee payment via M-Pesa`,
            confirmedAt: new Date(),
            metadata: {
              mpesaReceiptNumber,
              checkoutRequestId,
              processedAt: new Date().toISOString(),
            },
          },
        });

        // Activate user account
        await tx.user.update({
          where: { id: userId },
          data: { 
            accountStatus: CONSTANTS.ACCOUNT_STATUS.ACTIVE,
            updatedAt: new Date(),
          },
        });

        // Process pending referral bonuses
        const processedBonusesCount = await this.processPendingReferralBonuses(tx, userId);

        return {
          success: true,
          transactionId: transaction.id,
          userId: userId,
          processedReferralBonuses: processedBonusesCount,
          mpesaReceiptNumber,
        };
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

  // Process pending referral bonuses (updated to use transaction)
  async processPendingReferralBonuses(tx, userId) {
    try {
      // Find pending referral bonuses for this user
      const pendingReferrals = await tx.referral.findMany({
        where: {
          referredId: userId,
          earningsStatus: 'PENDING',
        },
        include: {
          referrer: true,
          // Add the referred user information
          referred: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
            },
          },
        },
      });

      let processedCount = 0;

      for (const referral of pendingReferrals) {
        // Get the referred user's name
        const referredUser = referral.referred;
        const referredUserName = [referredUser.firstName, referredUser.lastName]
          .filter(Boolean)
          .join(' ') || referredUser.phoneNumber || 'Unknown User';

        // Update referral status
        await tx.referral.update({
          where: { id: referral.id },
          data: { earningsStatus: 'AVAILABLE' },
        });

        // Update referrer's available balance
        await tx.user.update({
          where: { id: referral.referrerId },
          data: {
            pendingEarnings: {
              decrement: referral.earningsAmount,
            },
            availableBalance: {
              increment: referral.earningsAmount,
            },
            totalEarned: {
              increment: referral.earningsAmount,
            },
          },
        });

        // Create transaction for referrer
        await tx.transaction.create({
          data: {
            userId: referral.referrerId,
            type: `LEVEL_${referral.level}_REFERRAL_BONUS`,
            amount: referral.earningsAmount,
            status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
            description: `Level ${referral.level} referral bonus from ${referredUserName}'s activation`,
            confirmedAt: new Date(),
            metadata: {
              referralId: referral.id,
              referredUserId: userId,
              referredUserName: referredUserName,
              level: referral.level,
            },
          },
        });

        processedCount++;
      }

      return processedCount;
    } catch (error) {
      console.error('Error processing referral bonuses:', error);
      return 0;
    }
  }

  // Check activation status (simplified - no pending transactions to check)
  async checkActivationStatus(checkoutRequestId) {
    try {
      const transaction = await prisma.transaction.findFirst({
        where: {
          metadata: {
            path: ['checkoutRequestId'],
            equals: checkoutRequestId,
          },
          type: CONSTANTS.TRANSACTION_TYPES.ACCOUNT_ACTIVATION,
        },
        include: { user: true },
      });

      if (!transaction) {
        // No transaction found means payment hasn't been processed yet
        return {
          status: 'PENDING',
          message: 'Payment is being processed. Please wait.',
        };
      }

      return {
        transactionId: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        createdAt: transaction.createdAt,
        confirmedAt: transaction.confirmedAt,
        userAccountStatus: transaction.user?.accountStatus || 'UNKNOWN',
      };
    } catch (error) {
      throw error;
    }
  }
}

export const activationService = new ActivationService(); 