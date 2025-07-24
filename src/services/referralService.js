import { prisma } from '../lib/prisma.js';
import { CONSTANTS } from '../utils/constants.js';

// Get pending referral earnings for a user
export const getPendingReferralEarnings = async (userId) => {
  const pendingReferrals = await prisma.referral.findMany({
    where: {
      referrerId: userId,
      earningsStatus: CONSTANTS.EARNINGS_STATUS.PENDING,
    },
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
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Group by level and calculate totals
  const summary = {
    level1: { count: 0, amount: 0, referrals: [] },
    level2: { count: 0, amount: 0, referrals: [] },
    level3: { count: 0, amount: 0, referrals: [] },
  };

  let totalPendingAmount = 0;

  pendingReferrals.forEach(referral => {
    const level = `level${referral.level}`;
    const amount = Number(referral.earningsAmount);
    
    summary[level].count += 1;
    summary[level].amount += amount;
    summary[level].referrals.push({
      id: referral.id,
      amount: amount,
      referredUser: {
        fullName: [referral.referred.firstName, referral.referred.lastName]
          .filter(Boolean).join(' ') || 'Unknown',
        phoneNumber: referral.referred.phoneNumber,
        accountStatus: referral.referred.accountStatus,
        joinedAt: referral.referred.createdAt,
      },
      createdAt: referral.createdAt,
    });
    
    totalPendingAmount += amount;
  });

  return {
    totalPendingAmount,
    totalPendingCount: pendingReferrals.length,
    summary,
  };
};

// Calculate potential earnings when user activates
export const calculateActivationImpact = async (userId) => {
  // Find all users who will receive bonuses when this user activates
  const affectedReferrers = await prisma.referral.findMany({
    where: {
      referredId: userId,
      earningsStatus: CONSTANTS.EARNINGS_STATUS.PENDING,
    },
    include: {
      referrer: {
        select: {
          id: true,
          phoneNumber: true,
          firstName: true,
          lastName: true,
          pendingEarnings: true,
          availableBalance: true,
        },
      },
    },
  });

  const impactSummary = {
    affectedReferrers: affectedReferrers.length,
    totalBonusesToProcess: 0,
    referrerImpacts: [],
  };

  affectedReferrers.forEach(referral => {
    const bonusAmount = Number(referral.earningsAmount);
    impactSummary.totalBonusesToProcess += bonusAmount;
    
    impactSummary.referrerImpacts.push({
      referrerId: referral.referrerId,
      referrerName: [referral.referrer.firstName, referral.referrer.lastName]
        .filter(Boolean).join(' ') || 'Unknown',
      referrerPhone: referral.referrer.phoneNumber,
      level: referral.level,
      bonusAmount: bonusAmount,
      currentPendingEarnings: Number(referral.referrer.pendingEarnings),
      currentAvailableBalance: Number(referral.referrer.availableBalance),
    });
  });

  return impactSummary;
};

// Get referral chain for a user (who referred them and who they referred)
export const getReferralChain = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      referredBy: true,
      referralCode: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get upline (who referred this user)
  const upline = [];
  if (user.referredBy) {
    const directReferrer = await prisma.user.findUnique({
      where: { referralCode: user.referredBy },
      select: {
        id: true,
        phoneNumber: true,
        firstName: true,
        lastName: true,
        referralCode: true,
        referredBy: true,
      },
    });

    if (directReferrer) {
      upline.push({
        level: 1,
        user: {
          id: directReferrer.id,
          fullName: [directReferrer.firstName, directReferrer.lastName]
            .filter(Boolean).join(' ') || 'Unknown',
          phoneNumber: directReferrer.phoneNumber,
          referralCode: directReferrer.referralCode,
        },
      });

      // Get level 2 referrer
      if (directReferrer.referredBy) {
        const level2Referrer = await prisma.user.findUnique({
          where: { referralCode: directReferrer.referredBy },
          select: {
            id: true,
            phoneNumber: true,
            firstName: true,
            lastName: true,
            referralCode: true,
            referredBy: true,
          },
        });

        if (level2Referrer) {
          upline.push({
            level: 2,
            user: {
              id: level2Referrer.id,
              fullName: [level2Referrer.firstName, level2Referrer.lastName]
                .filter(Boolean).join(' ') || 'Unknown',
              phoneNumber: level2Referrer.phoneNumber,
              referralCode: level2Referrer.referralCode,
            },
          });

          // Get level 3 referrer
          if (level2Referrer.referredBy) {
            const level3Referrer = await prisma.user.findUnique({
              where: { referralCode: level2Referrer.referredBy },
              select: {
                id: true,
                phoneNumber: true,
                firstName: true,
                lastName: true,
                referralCode: true,
              },
            });

            if (level3Referrer) {
              upline.push({
                level: 3,
                user: {
                  id: level3Referrer.id,
                  fullName: [level3Referrer.firstName, level3Referrer.lastName]
                    .filter(Boolean).join(' ') || 'Unknown',
                  phoneNumber: level3Referrer.phoneNumber,
                  referralCode: level3Referrer.referralCode,
                },
              });
            }
          }
        }
      }
    }
  }

  // Get downline (users this user referred directly)
  const directReferrals = await prisma.user.findMany({
    where: { referredBy: user.referralCode },
    select: {
      id: true,
      phoneNumber: true,
      firstName: true,
      lastName: true,
      referralCode: true,
      accountStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const downline = directReferrals.map(referral => ({
    user: {
      id: referral.id,
      fullName: [referral.firstName, referral.lastName]
        .filter(Boolean).join(' ') || 'Unknown',
      phoneNumber: referral.phoneNumber,
      referralCode: referral.referralCode,
      accountStatus: referral.accountStatus,
      joinedAt: referral.createdAt,
    },
  }));

  return {
    userId,
    upline,
    downline,
    totalDownlineCount: downline.length,
  };
};

export default {
  getPendingReferralEarnings,
  calculateActivationImpact,
  getReferralChain,
};