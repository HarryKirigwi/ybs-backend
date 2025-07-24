import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { CONSTANTS } from './constants.js';

// Password utilities
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

export const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// JWT utilities
export const generateToken = (payload, expiresIn = CONSTANTS.JWT_EXPIRES_IN) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { 
    expiresIn: CONSTANTS.JWT_REFRESH_EXPIRES_IN 
  });
};

export const verifyToken = (token, secret = process.env.JWT_SECRET) => {
  return jwt.verify(token, secret);
};

// Phone number utilities
export const formatPhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Convert to international format
  if (cleaned.startsWith('0')) {
    return '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('254')) {
    return cleaned;
  } else if (cleaned.startsWith('+254')) {
    return cleaned.substring(1);
  }
  
  // If it's already in the correct format (assuming 9 digits starting with 7, 8, or 9)
  if (cleaned.length === 9 && /^[789]/.test(cleaned)) {
    return '254' + cleaned;
  }
  
  return cleaned;
};

export const validatePhoneNumber = (phoneNumber) => {
  const formatted = formatPhoneNumber(phoneNumber);
  return CONSTANTS.PHONE_REGEX.test('+' + formatted);
};

// Referral code generation
export const generateReferralCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < CONSTANTS.REFERRAL_CODE_LENGTH; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// User level calculation
export const calculateUserLevel = (totalReferrals) => {
  if (totalReferrals >= CONSTANTS.USER_LEVELS.GOLD.min) {
    return 'GOLD';
  } else if (totalReferrals >= CONSTANTS.USER_LEVELS.BRONZE.min) {
    return 'BRONZE';
  } else {
    return 'SILVER';
  }
};

// Date utilities
export const getToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

export const getWeekStart = (date = new Date()) => {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day;
  weekStart.setDate(diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

export const formatCurrency = (amount, currency = 'KSH') => {
  const formatted = new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${currency} ${formatted}`;
};

// Pagination utilities
export const getPaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(
    CONSTANTS.MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit) || CONSTANTS.DEFAULT_PAGE_SIZE)
  );
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
};

export const getPaginationMeta = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPrevPage,
  };
};

// Response formatting utilities
export const successResponse = (data, message = 'Success', meta = null) => {
  const response = {
    success: true,
    message,
    data,
  };
  
  if (meta) {
    response.meta = meta;
  }
  
  return response;
};

export const errorResponse = (message, errors = null) => {
  const response = {
    success: false,
    message,
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  return response;
};

// Validation utilities
export const validatePassword = (password) => {
  if (!password || password.length < CONSTANTS.PASSWORD_MIN_LENGTH) {
    return false;
  }
  return true;
};

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Generate M-Pesa timestamp
export const generateMpesaTimestamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}${hour}${minute}${second}`;
};

// Generate M-Pesa password
export const generateMpesaPassword = (shortCode, passkey, timestamp) => {
  const data = shortCode + passkey + timestamp;
  return Buffer.from(data).toString('base64');
};

// Referral level calculation
export const calculateReferralLevel = (referrer, referred) => {
  // This is a simplified version - you might need more complex logic
  // depending on how you want to handle multi-level referrals
  return 1; // For now, all direct referrals are level 1
};

// Calculate referral bonus amount
export const calculateReferralBonus = (level) => {
  switch (level) {
    case 1:
      return CONSTANTS.REFERRAL_BONUS.LEVEL_1;
    case 2:
      return CONSTANTS.REFERRAL_BONUS.LEVEL_2;
    case 3:
      return CONSTANTS.REFERRAL_BONUS.LEVEL_3;
    default:
      return 0;
  }
};

// Generate transaction reference
export const generateTransactionRef = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `TXN${timestamp}${random}`;
};

// Sanitize user data (remove sensitive fields and add fullName)
export const sanitizeUser = (user) => {
  const { passwordHash, ...sanitizedUser } = user;
  
  // Add fullName if firstName or lastName exists
  if (user.firstName || user.lastName) {
    sanitizedUser.fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
  }
  
  return sanitizedUser;
};

// Format user response for API responses
export const formatUserResponse = (user) => {
  const sanitized = sanitizeUser(user);
  
  // Add fullName combining firstName and lastName
  sanitized.fullName = combineNames(sanitized.firstName, sanitized.lastName);
  
  // You can choose to keep or remove individual name fields
  // If you want to remove them from API responses:
  // delete sanitized.firstName;
  // delete sanitized.lastName;
  
  return sanitized;
};

// Split fullName into firstName and lastName
export const splitFullName = (fullName) => {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: null, lastName: null };
  }

  const trimmedName = fullName.trim();
  if (!trimmedName) {
    return { firstName: null, lastName: null };
  }

  const nameParts = trimmedName.split(/\s+/); // Split by any whitespace
  
  if (nameParts.length === 1) {
    // Single name - treat as first name
    return {
      firstName: nameParts[0],
      lastName: null
    };
  } else {
    // Multiple names - first word is firstName, rest is lastName
    return {
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' ')
    };
  }
};

// Combine firstName and lastName into fullName
export const combineNames = (firstName, lastName) => {
  return [firstName, lastName].filter(Boolean).join(' ') || null;
};

// Calculate task completion percentage
export const calculateTaskCompletionPercentage = (completedTasks, totalTasks) => {
  if (totalTasks === 0) return 0;
  return Math.round((completedTasks / totalTasks) * 100);
};

// Get start and end of day
export const getStartOfDay = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getEndOfDay = (date = new Date()) => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
};

// Get start and end of month
export const getStartOfMonth = (date = new Date()) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

export const getEndOfMonth = (date = new Date()) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
};

// Get start and end of year
export const getStartOfYear = (date = new Date()) => {
  return new Date(date.getFullYear(), 0, 1);
};

export const getEndOfYear = (date = new Date()) => {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
};

// Deep clone object
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

// Sleep utility for testing
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Generate random number between min and max
export const randomBetween = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Check if value is empty
export const isEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

// Capitalize first letter
export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Format number with commas
export const formatNumber = (num) => {
  return new Intl.NumberFormat('en-KE').format(num);
};

// Calculate percentage
export const calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
};

// Generate UUID (simple version)
export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Validate M-Pesa phone number
export const validateMpesaNumber = (phoneNumber) => {
  const formatted = formatPhoneNumber(phoneNumber);
  // M-Pesa numbers should start with 254 and be 12 digits long
  return /^254[17][0-9]{8}$/.test(formatted);
};

// Calculate days between dates
export const daysBetween = (date1, date2) => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((date1 - date2) / oneDay));
};

// Get age from birth date
export const getAge = (birthDate) => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
};