// Custom error class
export class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = isOperational;
      this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
  
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  // Error handler middleware
  export const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
  
    // Log error
    console.error(err);
  
    // Prisma error handling
    if (err.name === 'PrismaClientKnownRequestError') {
      error = handlePrismaError(err);
    }
  
    // Validation error handling
    if (err.name === 'ValidationError') {
      error = handleValidationError(err);
    }
  
    // JWT error handling
    if (err.name === 'JsonWebTokenError') {
      error = new AppError('Invalid token. Please log in again.', 401);
    }
  
    if (err.name === 'TokenExpiredError') {
      error = new AppError('Your token has expired. Please log in again.', 401);
    }
  
    // Mongoose cast error (if you add MongoDB later)
    if (err.name === 'CastError') {
      error = new AppError('Invalid resource ID', 400);
    }
  
    // Default error response
    const statusCode = error.statusCode || 500;
    const message = error.isOperational ? error.message : 'Internal server error';
  
    res.status(statusCode).json({
      success: false,
      error: {
        message,
        ...(process.env.NODE_ENV === 'development' && {
          stack: err.stack,
          details: err,
        }),
      },
    });
  };
  
  // Handle Prisma errors
  const handlePrismaError = (err) => {
    switch (err.code) {
      case 'P2002':
        // Unique constraint violation
        const field = err.meta?.target?.[0] || 'field';
        return new AppError(`${field} already exists`, 400);
      
      case 'P2025':
        // Record not found
        return new AppError('Record not found', 404);
      
      case 'P2003':
        // Foreign key constraint violation
        return new AppError('Cannot delete record due to related data', 400);
      
      case 'P2014':
        // Required relation violation
        return new AppError('Related record does not exist', 400);
      
      default:
        return new AppError('Database error occurred', 500);
    }
  };
  
  // Handle validation errors
  const handleValidationError = (err) => {
    const errors = Object.values(err.errors).map(val => val.message);
    const message = `Invalid input data: ${errors.join('. ')}`;
    return new AppError(message, 400);
  };
  
  // Async error wrapper
  export const asyncHandler = (fn) => {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };