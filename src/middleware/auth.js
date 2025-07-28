import { verifyToken } from '../utils/helpers.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';
import { CONSTANTS } from '../utils/constants.js';
import jwt from 'jsonwebtoken';

// Protect routes - require authentication
export const protect = async (req, res, next) => {
  try {
    // Get token from cookie (prefer accessToken cookie)
    let token = req.cookies?.accessToken;

    // If not in cookie, fallback to Authorization header
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // If no access token, try to refresh using refresh token
    if (!token && req.cookies?.refreshToken) {
      try {
        const decodedRefresh = jwt.verify(req.cookies.refreshToken, process.env.JWT_REFRESH_SECRET);
        // Generate new access token
        token = jwt.sign(
          { id: decodedRefresh.id },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
        );
        // Set new access token cookie
        res.cookie('accessToken', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 15 * 60 * 1000
        });
      } catch (refreshError) {
        return next(new AppError('Invalid refresh token. Please log in again.', 401));
      }
    }

    if (!token) {
      return next(new AppError('Access denied. No token provided.', 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
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
        lastLogin: true,
      },
    });

    if (!user) {
      return next(new AppError('User not found. Please log in again.', 401));
    }

    // Check if user account is suspended
    if (user.accountStatus === CONSTANTS.ACCOUNT_STATUS.SUSPENDED) {
      return next(new AppError('Account suspended. Contact support.', 403));
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired. Please log in again.', 401));
    }
    next(error);
  }
};

// Require account activation
export const requireActivation = (req, res, next) => {
  if (req.user.accountStatus === CONSTANTS.ACCOUNT_STATUS.UNVERIFIED) {
    return next(new AppError('Account not activated. Please pay activation fee.', 403));
  }
  next();
};

// Admin authentication
export const adminProtect = async (req, res, next) => {
  try {
    // Get token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('Access denied. No token provided.', 401));
    }

    // Verify token
    const decoded = verifyToken(token);
    
    // Get admin from database
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    if (!admin) {
      return next(new AppError('Admin not found. Please log in again.', 401));
    }

    // Check if admin is active
    if (!admin.isActive) {
      return next(new AppError('Admin account disabled. Contact super admin.', 403));
    }

    // Attach admin to request
    req.admin = admin;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expired. Please log in again.', 401));
    }
    next(error);
  }
};

// Require super admin role
export const requireSuperAdmin = (req, res, next) => {
  if (req.admin.role !== 'super_admin') {
    return next(new AppError('Access denied. Super admin privileges required.', 403));
  }
  next();
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      const decoded = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
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
          lastLogin: true,
        },
      });

      if (user && user.accountStatus !== CONSTANTS.ACCOUNT_STATUS.SUSPENDED) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Continue without user if token is invalid
    next();
  }
};