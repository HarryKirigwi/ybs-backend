import { AppError } from './errorHandler.js';
import {
  validateUserRegistration,
  validateUserLogin,
  validateAdminLogin,
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
  validateAdminUserUpdate,
  validateAdminUserCreation,
} from '../utils/validators.js';
import { verificationService } from '../services/verificationService.js';
import { mpesaService } from '../services/mpesaService.js';
import { activationService } from '../services/activationService.js';

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
export const validateAdminLoginMiddleware = createValidationMiddleware(validateAdminLogin);
export const validatePhoneVerify = (req, res, next) => {
  const { action, phoneNumber, verificationCode } = req.body;

  const errors = [];

  if (!action || !['send', 'verify'].includes(action)) {
    errors.push('Action must be either "send" or "verify"');
  }

  if (!phoneNumber) {
    errors.push('Phone number is required');
  }

  if (action === 'verify' && !verificationCode) {
    errors.push('Verification code is required for verification');
  } else if (action === 'verify' && verificationCode.length !== 6) {
    errors.push('Verification code must be 6 digits');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed: ' + errors.join(', '),
        details: errors,
      },
    });
  }

  next();
};
export const validateActivation = (req, res, next) => {
  const { mpesaNumber, amount } = req.body;

  const errors = [];

  if (!mpesaNumber) {
    errors.push('M-Pesa number is required');
  }

  if (!amount) {
    errors.push('Amount is required');
  } else if (amount !== 600) {
    errors.push('Activation amount must be KSH 600');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed: ' + errors.join(', '),
        details: errors,
      },
    });
  }

  next();
};
export const validateWithdrawal = createValidationMiddleware(validateWithdrawalRequest);
export const validatePasswordChangeData = createValidationMiddleware(validatePasswordChange);
export const validateProfileUpdateData = createValidationMiddleware(validateProfileUpdate);
export const validateAdminUserUpdateData = createValidationMiddleware(validateAdminUserUpdate);
export const validateAdminUserCreationData = createValidationMiddleware(validateAdminUserCreation);
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

export const validateAdminId = (req, res, next) => {
  const { adminId } = req.params;
  
  if (!adminId || typeof adminId !== 'string') {
    return next(new AppError('Invalid admin ID format', 400));
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