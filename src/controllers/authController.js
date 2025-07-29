import { prisma } from '../lib/prisma.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  generateRefreshToken,
  formatPhoneNumber,
  successResponse,
  verifyToken,
  splitFullName,
  combineNames
} from '../utils/helpers.js';
import { generateUniqueReferralCode } from '../utils/codeGenerator.js';
import { CONSTANTS } from '../utils/constants.js';
import { verificationService } from '../services/verificationService.js';

// Register new user
export const register = asyncHandler(async (req, res, next) => {
  const { phoneNumber, email, password, fullName, referralCode } = req.body;

  // Format phone number and email
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const formattedEmail = email.trim().toLowerCase();

  // Split fullName into firstName and lastName for database storage
  const { firstName, lastName } = splitFullName(fullName);

  // Check if phone number already exists
  const existingUserByPhone = await prisma.user.findUnique({
    where: { phoneNumber: formattedPhone }
  });

  if (existingUserByPhone) {
    return next(new AppError(CONSTANTS.ERRORS.PHONE_EXISTS, 400));
  }

  // Check if email already exists
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email: formattedEmail }
  });

  if (existingUserByEmail) {
    return next(new AppError('Email address already registered', 400));
  }

  // Validate referral code if provided
  let referrer = null;
  if (referralCode) {
    referrer = await prisma.user.findUnique({
      where: { referralCode }
    });

    if (!referrer) {
      return next(new AppError(CONSTANTS.ERRORS.REFERRAL_CODE_NOT_FOUND, 400));
    }

    // Check if referrer's phone number or email is the same (prevent self-referral)
    if (referrer.phoneNumber === formattedPhone || referrer.email === formattedEmail) {
      return next(new AppError(CONSTANTS.ERRORS.SELF_REFERRAL, 400));
    }
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Generate unique referral code
  const uniqueReferralCode = await generateUniqueReferralCode();

  // Create user in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create user with split names
    const user = await tx.user.create({
      data: {
        phoneNumber: formattedPhone,
        email: formattedEmail,
        passwordHash: hashedPassword,
        firstName: firstName,
        lastName: lastName,
        referralCode: uniqueReferralCode,
        referredBy: referralCode || null,
      },
      select: {
        id: true,
        phoneNumber: true,
        email: true,
        firstName: true,
        lastName: true,
        referralCode: true,
        accountStatus: true,
        createdAt: true,
        phoneVerified: true,
      },
    });

    // If user was referred, create referral relationships and update pending earnings
    if (referrer) {
      // Create direct referral (Level 1) and update referrer's pending earnings
      await tx.referral.create({
        data: {
          referrerId: referrer.id,
          referredId: user.id,
          level: 1,
          earningsAmount: CONSTANTS.REFERRAL_BONUS.LEVEL_1,
          earningsStatus: 'PENDING', // Explicitly set as pending
        },
      });

      // Add to referrer's pending earnings and update total referrals
      await tx.user.update({
        where: { id: referrer.id },
        data: {
          totalReferrals: {
            increment: 1,
          },
          pendingEarnings: {
            increment: CONSTANTS.REFERRAL_BONUS.LEVEL_1,
          },
        },
      });

      // Check for Level 2 referral (referrer's referrer)
      if (referrer.referredBy) {
        const level2Referrer = await tx.user.findUnique({
          where: { referralCode: referrer.referredBy }
        });

        if (level2Referrer) {
          await tx.referral.create({
            data: {
              referrerId: level2Referrer.id,
              referredId: user.id,
              level: 2,
              earningsAmount: CONSTANTS.REFERRAL_BONUS.LEVEL_2,
              earningsStatus: 'PENDING',
            },
          });

          await tx.user.update({
            where: { id: level2Referrer.id },
            data: {
              totalReferrals: {
                increment: 1,
              },
              pendingEarnings: {
                increment: CONSTANTS.REFERRAL_BONUS.LEVEL_2,
              },
            },
          });

          // Check for Level 3 referral (level 2 referrer's referrer)
          if (level2Referrer.referredBy) {
            const level3Referrer = await tx.user.findUnique({
              where: { referralCode: level2Referrer.referredBy }
            });

            if (level3Referrer) {
              await tx.referral.create({
                data: {
                  referrerId: level3Referrer.id,
                  referredId: user.id,
                  level: 3,
                  earningsAmount: CONSTANTS.REFERRAL_BONUS.LEVEL_3,
                  earningsStatus: 'PENDING',
                },
              });

              await tx.user.update({
                where: { id: level3Referrer.id },
                data: {
                  totalReferrals: {
                    increment: 1,
                  },
                  pendingEarnings: {
                    increment: CONSTANTS.REFERRAL_BONUS.LEVEL_3,
                  },
                },
              });
            }
          }
        }
      }
    }

    return user;
  });

  // Generate tokens
  const token = generateToken({ id: result.id });
  const refreshToken = generateRefreshToken({ id: result.id });

  // Format response with fullName
  const responseUser = {
    ...result,
    fullName: combineNames(result.firstName, result.lastName),
  };

  // Set HTTP-only cookies
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.status(201).json(successResponse({
    user: responseUser,
    requiresPhoneVerification: true
  }, CONSTANTS.SUCCESS.REGISTRATION));
});

// Login user
export const login = asyncHandler(async (req, res, next) => {
  const { phoneNumber, password } = req.body;

  // Format phone number
  const formattedPhone = formatPhoneNumber(phoneNumber);

  // Find user by phone number
  const user = await prisma.user.findUnique({
    where: { phoneNumber: formattedPhone },
    select: {
      id: true,
      phoneNumber: true,
      passwordHash: true,
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
    },
  });

  if (!user || !(await comparePassword(password, user.passwordHash))) {
    return next(new AppError(CONSTANTS.ERRORS.INVALID_CREDENTIALS, 401));
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  // Mark daily login task
  await markDailyLoginTask(user.id);

  // Remove password hash from response and add fullName
  const { passwordHash, ...userWithoutPassword } = user;
  const userResponse = {
    ...userWithoutPassword,
    fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
  };

  // Generate tokens
  const token = generateToken({ id: user.id });
  const refreshToken = generateRefreshToken({ id: user.id });

  // Set HTTP-only cookies
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.json(successResponse({
    user: userResponse,
    message: 'Login successful'
  }, CONSTANTS.SUCCESS.LOGIN));
});

// Admin login
export const adminLogin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const formattedEmail = email.trim().toLowerCase();

  // Find admin by email
  const admin = await prisma.admin.findUnique({
    where: { email: formattedEmail },
    select: {
      id: true,
      username: true,
      email: true,
      passwordHash: true,
      role: true,
      firstName: true,
      lastName: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!admin || !(await comparePassword(password, admin.passwordHash))) {
    return next(new AppError('Invalid email or password', 401));
  }

  if (!admin.isActive) {
    return next(new AppError('Admin account is disabled', 403));
  }

  // Update last login
  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLogin: new Date() },
  });

  // Remove password hash from response and add fullName
  const { passwordHash, ...adminWithoutPassword } = admin;
  const adminResponse = {
    ...adminWithoutPassword,
    fullName: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || null,
  };

  // Generate tokens with role information
  const token = generateToken({ 
    id: admin.id, 
    role: admin.role, 
    type: 'admin' 
  });
  const refreshToken = generateRefreshToken({ 
    id: admin.id, 
    role: admin.role, 
    type: 'admin' 
  });

  res.json(successResponse({
    admin: adminResponse,
    token,
    refreshToken,
  }, 'Admin login successful'));
});

// Updated verifyPhone to handle both send and verify actions
export const verifyPhone = asyncHandler(async (req, res, next) => {
  const { action, phoneNumber, verificationCode } = req.body;

  if (action === 'send') {
    // Send verification code
    try {
      const result = await verificationService.sendVerificationCode(phoneNumber);
      
      res.json(successResponse(
        { 
          sent: true,
          phoneNumber: result.phoneNumber,
          // Show code in development for testing
          code: process.env.NODE_ENV === 'development' ? result.code : undefined
        },
        'Verification code sent successfully'
      ));
    } catch (error) {
      return next(new AppError(error.message, 400));
    }
  } else if (action === 'verify') {
    // Verify the code
    try {
      const result = await verificationService.verifyCode(phoneNumber, verificationCode);
      
      // Update user's phone verification status
      await prisma.user.update({
        where: { phoneNumber: result.phoneNumber },
        data: { 
          phoneVerified: true,
          phoneVerifiedAt: new Date()
        }
      });

      res.json(successResponse(
        { 
          verified: true,
          phoneNumber: result.phoneNumber
        },
        'Phone number verified successfully'
      ));
    } catch (error) {
      return next(new AppError(error.message, 400));
    }
  } else {
    return next(new AppError('Invalid action. Use "send" or "verify".', 400));
  }
});

// Change password
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  // Get user with password hash
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });

  // Verify current password
  if (!(await comparePassword(currentPassword, user.passwordHash))) {
    return next(new AppError('Current password is incorrect', 400));
  }

  // Hash new password
  const hashedNewPassword = await hashPassword(newPassword);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashedNewPassword },
  });

  res.json(successResponse(
    { changed: true },
    CONSTANTS.SUCCESS.PASSWORD_CHANGED
  ));
});

// Forgot password - initiate reset
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { phoneNumber } = req.body;

  const formattedPhone = formatPhoneNumber(phoneNumber);

  const user = await prisma.user.findUnique({
    where: { phoneNumber: formattedPhone }
  });

  if (!user) {
    // Don't reveal if user exists or not
    return res.json(successResponse(
      { sent: true },
      'If the phone number exists, a reset code has been sent'
    ));
  }

  // Generate reset code
  const resetCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
  const resetExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // In production, store in Redis or database
  // await redis.setex(`reset:${formattedPhone}`, 600, resetCode);

  console.log(`SMS: Your password reset code is ${resetCode}`);

  res.json(successResponse(
    { 
      sent: true,
      // Remove this in production
      code: process.env.NODE_ENV === 'development' ? resetCode : undefined
    },
    'Password reset code sent successfully'
  ));
});

// Reset password with code
export const resetPassword = asyncHandler(async (req, res, next) => {
  const { phoneNumber, resetCode, newPassword } = req.body;

  const formattedPhone = formatPhoneNumber(phoneNumber);

  // In production, verify code from Redis
  // const storedCode = await redis.get(`reset:${formattedPhone}`);
  // if (!storedCode || storedCode !== resetCode) {
  //   return next(new AppError('Invalid or expired reset code', 400));
  // }

  // Placeholder verification (remove in production)
  if (resetCode !== '1234') {
    return next(new AppError('Invalid reset code', 400));
  }

  const user = await prisma.user.findUnique({
    where: { phoneNumber: formattedPhone }
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Hash new password
  const hashedPassword = await hashPassword(newPassword);

  // Update password
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashedPassword },
  });

  // Delete reset code from Redis
  // await redis.del(`reset:${formattedPhone}`);

  res.json(successResponse(
    { reset: true },
    'Password reset successfully'
  ));
});

// Refresh token
export const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    return next(new AppError('Refresh token is required', 400));
  }

  try {
    // Verify refresh token
    const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET);
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, accountStatus: true },
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (user.accountStatus === CONSTANTS.ACCOUNT_STATUS.SUSPENDED) {
      return next(new AppError('Account suspended', 403));
    }

    // Generate new tokens
    const newToken = generateToken({ id: user.id });
    const newRefreshToken = generateRefreshToken({ id: user.id });

    res.json(successResponse({
      token: newToken,
      refreshToken: newRefreshToken,
    }, 'Token refreshed successfully'));

  } catch (error) {
    return next(new AppError('Invalid refresh token', 401));
  }
});

// Get current user
export const getMe = asyncHandler(async (req, res) => {
  // User is already attached to req by protect middleware
  res.json(successResponse(req.user, 'User profile retrieved successfully'));
});

// Logout (client-side token removal, but we can log it)
export const logout = asyncHandler(async (req, res) => {
  // Clear cookies (no need to pass values, just match the options used when setting them)
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
  });

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
  });

  res.json(successResponse(
    { loggedOut: true },
    CONSTANTS.SUCCESS.LOGOUT
  ));
});

// Admin refresh token
export const adminRefreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    return next(new AppError('Refresh token is required', 400));
  }

  try {
    // Verify refresh token
    const decoded = verifyToken(token, process.env.JWT_REFRESH_SECRET);
    
    // Check if admin exists
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.id },
      select: { id: true, isActive: true },
    });

    if (!admin || !admin.isActive) {
      return next(new AppError('Admin not found or inactive', 404));
    }

    // Generate new tokens
    const newToken = generateToken({ id: admin.id, role: 'admin' });
    const newRefreshToken = generateRefreshToken({ id: admin.id, role: 'admin' });

    res.json(successResponse({
      token: newToken,
      refreshToken: newRefreshToken,
    }, 'Admin token refreshed successfully'));

  } catch (error) {
    return next(new AppError('Invalid refresh token', 401));
  }
});

// Get current admin with permissions
export const getAdminMe = asyncHandler(async (req, res) => {
  const admin = req.admin;
  
  // Get admin permissions based on role
  const permissions = CONSTANTS.ROLE_PERMISSIONS[admin.role] || [];
  
  const adminResponse = {
    ...admin,
    fullName: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || null,
    permissions,
    roleDescription: getRoleDescription(admin.role),
  };

  res.json(successResponse(adminResponse, 'Admin profile retrieved successfully'));
});

// Helper function to get role descriptions
const getRoleDescription = (role) => {
  const descriptions = {
    SUPER_ADMIN: 'Full system access and admin management',
    ADMIN: 'User management, financial operations, and analytics',
    MODERATOR: 'User moderation and basic financial viewing',
    SUPPORT: 'View-only access for customer support',
  };
  
  return descriptions[role] || 'Unknown role';
};

// Check if phone number is available
export const checkPhoneAvailability = asyncHandler(async (req, res) => {
  const { phoneNumber } = req.params;

  const formattedPhone = formatPhoneNumber(phoneNumber);

  const existingUser = await prisma.user.findUnique({
    where: { phoneNumber: formattedPhone },
    select: { id: true }
  });

  res.json(successResponse({
    available: !existingUser,
    phoneNumber: formattedPhone,
  }, 'Phone availability checked'));
});

// Check if email is available
export const checkEmailAvailability = asyncHandler(async (req, res) => {
  const { email } = req.params;

  const formattedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email: formattedEmail },
    select: { id: true }
  });

  res.json(successResponse({
    available: !existingUser,
    email: formattedEmail,
  }, 'Email availability checked'));
});

// Helper function to mark daily login task
const markDailyLoginTask = async (userId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Find or create today's task record
    const existingTask = await prisma.dailyTask.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    if (!existingTask) {
      // Create new daily task record with login marked
      await prisma.dailyTask.create({
        data: {
          userId,
          date: today,
          dailyLogin: true,
          completedTasksCount: 1,
        },
      });
    } else if (!existingTask.dailyLogin) {
      // Update existing record to mark login
      await prisma.dailyTask.update({
        where: { id: existingTask.id },
        data: {
          dailyLogin: true,
          completedTasksCount: {
            increment: 1,
          },
        },
      });
    }
  } catch (error) {
    // Don't fail login if daily task update fails
    console.error('Failed to mark daily login task:', error);
  }
};