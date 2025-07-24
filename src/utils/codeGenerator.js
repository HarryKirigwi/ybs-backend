import { prisma } from '../lib/prisma.js';
import { CONSTANTS } from './constants.js';

// Generate unique referral code
export const generateUniqueReferralCode = async (maxAttempts = 10) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateReferralCode();
    
    // Check if code already exists
    const existingUser = await prisma.user.findUnique({
      where: { referralCode: code }
    });
    
    if (!existingUser) {
      return code;
    }
  }
  
  throw new Error('Unable to generate unique referral code');
};

// Generate referral code
const generateReferralCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < CONSTANTS.REFERRAL_CODE_LENGTH; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
};

// Generate referral link
export const generateReferralLink = (referralCode, baseUrl = process.env.FRONTEND_URL) => {
  return `${baseUrl}/register?ref=${referralCode}`;
};

// Generate verification code for phone numbers
export const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
};

// Generate transaction ID
export const generateTransactionId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `TXN${timestamp}${random.toString().padStart(4, '0')}`;
};

// Generate withdrawal request ID
export const generateWithdrawalId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `WDR${timestamp}${random.toString().padStart(3, '0')}`;
};

// Generate M-Pesa transaction reference
export const generateMpesaReference = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100);
  return `MP${timestamp}${random.toString().padStart(2, '0')}`;
};

// Generate API key for external integrations
export const generateApiKey = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < 32; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
};

// Generate session ID
export const generateSessionId = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < 16; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
};

// Generate reset token for password reset
export const generateResetToken = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < 64; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
};

// Generate order number for product sales
export const generateOrderNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000);
  
  return `ORD${year}${month}${day}${random.toString().padStart(4, '0')}`;
};

// Generate coupon code
export const generateCouponCode = (length = 8) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
};

// Generate batch ID for bulk operations
export const generateBatchId = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `BATCH${timestamp}${random.toString().padStart(3, '0')}`;
};

export default {
  generateUniqueReferralCode,
  generateReferralLink,
  generateVerificationCode,
  generateTransactionId,
  generateWithdrawalId,
  generateMpesaReference,
  generateApiKey,
  generateSessionId,
  generateResetToken,
  generateOrderNumber,
  generateCouponCode,
  generateBatchId,
};