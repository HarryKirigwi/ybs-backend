import { AppError } from './errorHandler.js';
import {
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
} from '../utils/validators.js';

// Generic validation middleware factory
const createValidationMiddleware = (validatorFunction) => {
  return (req, res, next) => {
    const result = validatorFunction(req.body);
    
    if (result.hasErrors()) {
      const errorMessages = result.getErrors().map(error => error.message);
      return next(new AppError(`Validation failed: ${errorMessages.join(', ')}`, 400));
    }
    
    next();
  };
};

// Generic query validation middleware factory
const createQueryValidationMiddleware = (validatorFunction) => {
  return (req, res, next) => {
    const result = validatorFunction(req.query);
    
    if (result.hasErrors()) {
      const errorMessages = result.getErrors().map(error => error.message);
      return next(new AppError(`Query validation failed: ${errorMessages.join(', ')}`, 400));
    }
    
    next();
  };
};

// User validation middleware
export const validateRegistration = createValidationMiddleware(validateUserRegistration);
export const validateLogin = createValidationMiddleware(validateUserLogin);
export const validatePhoneVerify = createValidationMiddleware(validatePhoneVerification);
export const validateActivation = createValidationMiddleware(validateAccountActivation);
export const validateWithdrawal = createValidationMiddleware(validateWithdrawalRequest);
export const validatePasswordChangeData = createValidationMiddleware(validatePasswordChange);
export const validateProfileUpdateData = createValidationMiddleware(validateProfileUpdate);
export const validateSale = createValidationMiddleware(validateProductSale);
export const validateAdminUserData = createValidationMiddleware(validateAdminUser);

// Query validation middleware
export const validatePaginationQuery = createQueryValidationMiddleware(validatePagination);
export const validateDateRangeQuery = createQueryValidationMiddleware(validateDateRange);

// Custom validation middleware for specific routes
export const validateReferralCode = (req, res, next) => {
  const { referralCode } = req.params;
  
  if (!referralCode || typeof referralCode !== 'string' || referralCode.length !== 8) {
    return next(new AppError('Invalid referral code format', 400));
  }
  
  next();
};

export const validateUserId = (req, res, next) => {
  const { userId } = req.params;
  
  if (!userId || typeof userId !== 'string') {
    return next(new AppError('Invalid user ID format', 400));
  }
  
  next();
};

export const validateTransactionId = (req, res, next) => {
  const { transactionId } = req.params;
  
  if (!transactionId || typeof transactionId !== 'string') {
    return next(new AppError('Invalid transaction ID format', 400));
  }
  
  next();
};

export const validateWithdrawalId = (req, res, next) => {
  const { withdrawalId } = req.params;
  
  if (!withdrawalId || typeof withdrawalId !== 'string') {
    return next(new AppError('Invalid withdrawal ID format', 400));
  }
  
  next();
};

export const validateProductId = (req, res, next) => {
  const { productId } = req.params;
  
  if (!productId || typeof productId !== 'string') {
    return next(new AppError('Invalid product ID format', 400));
  }
  
  next();
};

// Validate required fields dynamically
export const validateRequired = (fields) => {
  return (req, res, next) => {
    const result = validateRequiredFields(req.body, fields);
    
    if (result.hasErrors()) {
      const errorMessages = result.getErrors().map(error => error.message);
      return next(new AppError(`Missing required fields: ${errorMessages.join(', ')}`, 400));
    }
    
    next();
  };
};

// Validate M-Pesa callback
export const validateMpesaCallback = (req, res, next) => {
  const { Body } = req.body;
  
  if (!Body || !Body.stkCallback) {
    return next(new AppError('Invalid M-Pesa callback format', 400));
  }
  
  next();
};

// Validate admin withdrawal resolution
export const validateWithdrawalResolution = (req, res, next) => {
  const { status, mpesaTransactionCode, rejectionReason } = req.body;
  
  if (!status || !['COMPLETED', 'REJECTED'].includes(status)) {
    return next(new AppError('Status must be either COMPLETED or REJECTED', 400));
  }
  
  if (status === 'COMPLETED' && !mpesaTransactionCode) {
    return next(new AppError('M-Pesa transaction code is required for completed withdrawals', 400));
  }
  
  if (status === 'REJECTED' && !rejectionReason) {
    return next(new AppError('Rejection reason is required for rejected withdrawals', 400));
  }
  
  next();
};

// Validate task completion
export const validateTaskCompletion = (req, res, next) => {
  const { taskType } = req.body;
  const validTasks = ['shareReferral', 'dailyLogin', 'watchVideos', 'inviteMember'];
  
  if (!taskType || !validTasks.includes(taskType)) {
    return next(new AppError(`Task type must be one of: ${validTasks.join(', ')}`, 400));
  }
  
  next();
};

// Validate admin user status update
export const validateUserStatusUpdate = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['ACTIVE', 'SUSPENDED'];
  
  if (!status || !validStatuses.includes(status)) {
    return next(new AppError(`Status must be one of: ${validStatuses.join(', ')}`, 400));
  }
  
  next();
};