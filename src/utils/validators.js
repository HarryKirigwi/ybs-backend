import { CONSTANTS } from './constants.js';
import { formatPhoneNumber } from './helpers.js';

// Base validation class
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

// Validation result class
export class ValidationResult {
  constructor() {
    this.errors = [];
    this.isValid = true;
  }

  addError(field, message) {
    this.errors.push({ field, message });
    this.isValid = false;
  }

  getErrors() {
    return this.errors;
  }

  getErrorsForField(field) {
    return this.errors.filter(error => error.field === field);
  }

  hasErrors() {
    return !this.isValid;
  }

  throwIfInvalid() {
    if (this.hasErrors()) {
      const errorMessages = this.errors.map(error => `${error.field}: ${error.message}`);
      throw new ValidationError(`Validation failed: ${errorMessages.join(', ')}`);
    }
  }
}

// User registration validation
export const validateUserRegistration = (data) => {
  const result = new ValidationResult();
  const { phoneNumber, email, password, fullName, referralCode } = data;

  // Phone number validation
  if (!phoneNumber) {
    result.addError('phoneNumber', 'Phone number is required');
  } else {
    const formatted = formatPhoneNumber(phoneNumber);
    if (!CONSTANTS.PHONE_REGEX.test('+' + formatted)) {
      result.addError('phoneNumber', 'Invalid phone number format');
    }
  }

  // Email validation
  if (!email) {
    result.addError('email', 'Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      result.addError('email', 'Invalid email format');
    }
  }

  // Password validation
  if (!password) {
    result.addError('password', 'Password is required');
  } else if (password.length < CONSTANTS.PASSWORD_MIN_LENGTH) {
    result.addError('password', `Password must be at least ${CONSTANTS.PASSWORD_MIN_LENGTH} characters long`);
  }

  // Full name validation (optional)
  if (fullName !== undefined) {
    if (typeof fullName !== 'string') {
      result.addError('fullName', 'Full name must be a string');
    } else if (fullName.trim().length > 100) {
      result.addError('fullName', 'Full name cannot exceed 100 characters');
    }
  }

  // Referral code validation (optional)
  if (referralCode && typeof referralCode !== 'string') {
    result.addError('referralCode', 'Referral code must be a string');
  }

  return result;
};

// User login validation
export const validateUserLogin = (data) => {
  const result = new ValidationResult();
  const { phoneNumber, password } = data;

  // Phone number validation
  if (!phoneNumber) {
    result.addError('phoneNumber', 'Phone number is required');
  }

  // Password validation
  if (!password) {
    result.addError('password', 'Password is required');
  }

  return result;
};

// Phone verification validation
export const validatePhoneVerification = (data) => {
  const result = new ValidationResult();
  const { phoneNumber, verificationCode } = data;

  // Phone number validation
  if (!phoneNumber) {
    result.addError('phoneNumber', 'Phone number is required');
  }

  // Verification code validation
  if (!verificationCode) {
    result.addError('verificationCode', 'Verification code is required');
  } else if (!/^\d{6}$/.test(verificationCode)) {
    result.addError('verificationCode', 'Verification code must be 6 digits');
  }

  return result;
};

// Account activation validation
export const validateAccountActivation = (data) => {
  const result = new ValidationResult();
  const { mpesaNumber } = data;

  // M-Pesa number validation
  if (!mpesaNumber) {
    result.addError('mpesaNumber', 'M-Pesa number is required');
  } else {
    const formatted = formatPhoneNumber(mpesaNumber);
    if (!CONSTANTS.PHONE_REGEX.test('+' + formatted)) {
      result.addError('mpesaNumber', 'Invalid M-Pesa number format');
    }
  }

  return result;
};

// Withdrawal request validation
export const validateWithdrawalRequest = (data) => {
  const result = new ValidationResult();
  const { amount, mpesaNumber } = data;

  // Amount validation
  if (!amount) {
    result.addError('amount', 'Amount is required');
  } else {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      result.addError('amount', 'Amount must be a positive number');
    } else if (numAmount < CONSTANTS.MIN_WITHDRAWAL_AMOUNT) {
      result.addError('amount', `Minimum withdrawal amount is KSH ${CONSTANTS.MIN_WITHDRAWAL_AMOUNT}`);
    }
  }

  // M-Pesa number validation
  if (!mpesaNumber) {
    result.addError('mpesaNumber', 'M-Pesa number is required');
  } else {
    const formatted = formatPhoneNumber(mpesaNumber);
    if (!CONSTANTS.PHONE_REGEX.test('+' + formatted)) {
      result.addError('mpesaNumber', 'Invalid M-Pesa number format');
    }
  }

  return result;
};

// Password change validation
export const validatePasswordChange = (data) => {
  const result = new ValidationResult();
  const { currentPassword, newPassword, confirmPassword } = data;

  // Current password validation
  if (!currentPassword) {
    result.addError('currentPassword', 'Current password is required');
  }

  // New password validation
  if (!newPassword) {
    result.addError('newPassword', 'New password is required');
  } else if (newPassword.length < CONSTANTS.PASSWORD_MIN_LENGTH) {
    result.addError('newPassword', `New password must be at least ${CONSTANTS.PASSWORD_MIN_LENGTH} characters long`);
  }

  // Confirm password validation
  if (!confirmPassword) {
    result.addError('confirmPassword', 'Password confirmation is required');
  } else if (newPassword !== confirmPassword) {
    result.addError('confirmPassword', 'Passwords do not match');
  }

  // Check if new password is different from current
  if (currentPassword && newPassword && currentPassword === newPassword) {
    result.addError('newPassword', 'New password must be different from current password');
  }

  return result;
};

// Profile update validation
export const validateProfileUpdate = (data) => {
  const result = new ValidationResult();
  const { firstName, lastName, email } = data;

  // First name validation (optional)
  if (firstName !== undefined) {
    if (typeof firstName !== 'string') {
      result.addError('firstName', 'First name must be a string');
    } else if (firstName.trim().length === 0) {
      result.addError('firstName', 'First name cannot be empty');
    } else if (firstName.trim().length > 50) {
      result.addError('firstName', 'First name cannot exceed 50 characters');
    }
  }

  // Last name validation (optional)
  if (lastName !== undefined) {
    if (typeof lastName !== 'string') {
      result.addError('lastName', 'Last name must be a string');
    } else if (lastName.trim().length === 0) {
      result.addError('lastName', 'Last name cannot be empty');
    } else if (lastName.trim().length > 50) {
      result.addError('lastName', 'Last name cannot exceed 50 characters');
    }
  }

  // Email validation (optional)
  if (email !== undefined) {
    if (typeof email !== 'string') {
      result.addError('email', 'Email must be a string');
    } else if (email.trim().length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        result.addError('email', 'Invalid email format');
      }
    }
  }

  return result;
};

// Pagination validation
export const validatePagination = (data) => {
  const result = new ValidationResult();
  const { page, limit } = data;

  // Page validation
  if (page !== undefined) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      result.addError('page', 'Page must be a positive integer');
    }
  }

  // Limit validation
  if (limit !== undefined) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1) {
      result.addError('limit', 'Limit must be a positive integer');
    } else if (limitNum > CONSTANTS.MAX_PAGE_SIZE) {
      result.addError('limit', `Limit cannot exceed ${CONSTANTS.MAX_PAGE_SIZE}`);
    }
  }

  return result;
};

// Product sale validation
export const validateProductSale = (data) => {
  const result = new ValidationResult();
  const { productId, saleAmount, customerInfo } = data;

  // Product ID validation
  if (!productId) {
    result.addError('productId', 'Product ID is required');
  } else if (typeof productId !== 'string') {
    result.addError('productId', 'Product ID must be a string');
  }

  // Sale amount validation
  if (!saleAmount) {
    result.addError('saleAmount', 'Sale amount is required');
  } else {
    const amount = parseFloat(saleAmount);
    if (isNaN(amount) || amount <= 0) {
      result.addError('saleAmount', 'Sale amount must be a positive number');
    }
  }

  // Customer info validation (optional)
  if (customerInfo !== undefined) {
    if (typeof customerInfo !== 'object') {
      result.addError('customerInfo', 'Customer info must be an object');
    }
  }

  return result;
};

// Admin user validation
export const validateAdminUser = (data) => {
  const result = new ValidationResult();
  const { username, email, password, firstName, lastName } = data;

  // Username validation
  if (!username) {
    result.addError('username', 'Username is required');
  } else if (username.length < 3) {
    result.addError('username', 'Username must be at least 3 characters long');
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    result.addError('username', 'Username can only contain letters, numbers, and underscores');
  }

  // Email validation
  if (!email) {
    result.addError('email', 'Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      result.addError('email', 'Invalid email format');
    }
  }

  // Password validation
  if (!password) {
    result.addError('password', 'Password is required');
  } else if (password.length < 8) {
    result.addError('password', 'Password must be at least 8 characters long');
  }

  // First name validation
  if (!firstName) {
    result.addError('firstName', 'First name is required');
  } else if (firstName.trim().length === 0) {
    result.addError('firstName', 'First name cannot be empty');
  }

  // Last name validation
  if (!lastName) {
    result.addError('lastName', 'Last name is required');
  } else if (lastName.trim().length === 0) {
    result.addError('lastName', 'Last name cannot be empty');
  }

  return result;
};

// Date range validation
export const validateDateRange = (data) => {
  const result = new ValidationResult();
  const { startDate, endDate } = data;

  // Start date validation
  if (startDate && isNaN(Date.parse(startDate))) {
    result.addError('startDate', 'Invalid start date format');
  }

  // End date validation
  if (endDate && isNaN(Date.parse(endDate))) {
    result.addError('endDate', 'Invalid end date format');
  }

  // Date range validation
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      result.addError('dateRange', 'Start date must be before end date');
    }
  }

  return result;
};

// Generic required fields validation
export const validateRequiredFields = (data, requiredFields) => {
  const result = new ValidationResult();

  requiredFields.forEach(field => {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      result.addError(field, `${field} is required`);
    }
  });

  return result;
};

// Transaction data validation
export const validateTransactionData = (data) => {
  const result = new ValidationResult();
  const { amount, type, userId, status } = data;

  // Amount validation
  if (amount === undefined || amount === null) {
    result.addError('amount', 'Amount is required');
  } else {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      result.addError('amount', 'Amount must be a positive number');
    }
  }

  // Type validation
  if (!type || typeof type !== 'string') {
    result.addError('type', 'Transaction type is required');
  }

  // User ID validation
  if (!userId || typeof userId !== 'string') {
    result.addError('userId', 'User ID is required');
  }

  // Status validation (optional, but if present, must be a string)
  if (status !== undefined && typeof status !== 'string') {
    result.addError('status', 'Status must be a string');
  }

  return result;
};

// Admin login validation
export const validateAdminLogin = (data) => {
  const result = new ValidationResult();
  const { email, password } = data;

  // Email validation
  if (!email) {
    result.addError('email', 'Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      result.addError('email', 'Invalid email format');
    }
  }

  // Password validation
  if (!password) {
    result.addError('password', 'Password is required');
  } else if (password.length < 6) {
    result.addError('password', 'Password must be at least 6 characters long');
  }

  return result;
};

export default {
  ValidationError,
  ValidationResult,
  validateUserRegistration,
  validateUserLogin,
  validatePhoneVerification,
  validateAccountActivation,
  validateWithdrawalRequest,
  validatePasswordChange,
  validateProfileUpdate,
  validatePagination,
  validateProductSale,
  validateAdminUser,
  validateDateRange,
  validateRequiredFields,
  validateTransactionData,
  validateAdminLogin,
};