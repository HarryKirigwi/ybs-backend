// Application constants
export const CONSTANTS = {
    // Financial constants
    ACTIVATION_FEE: 600,
    MIN_WITHDRAWAL_AMOUNT: 1000,
    
    // Referral bonuses
    REFERRAL_BONUS: {
      LEVEL_1: 300,
      LEVEL_2: 100,
      LEVEL_3: 50,
    },
    
    // User levels
    USER_LEVELS: {
      SILVER: { min: 1, max: 10, name: 'SILVER' },
      BRONZE: { min: 11, max: 20, name: 'BRONZE' },
      GOLD: { min: 21, max: Infinity, name: 'GOLD' },
    },
    
    // Weekly challenge rewards
    WEEKLY_CHALLENGE_BONUS: 100,
    
    // Task completion requirements
    DAILY_TASKS: {
      SHARE_REFERRAL: 'shareReferral',
      DAILY_LOGIN: 'dailyLogin',
      WATCH_VIDEOS: 'watchVideos',
      INVITE_MEMBER: 'inviteMember',
    },
    
    WEEKLY_CHALLENGES: {
      REFER_5_MEMBERS: 'refer5Members',
      COMPLETE_10_TASKS: 'complete10Tasks',
      PROMOTE_3_PRODUCTS: 'promote3Products',
    },
    
    // Video watching requirements
    VIDEOS_TO_WATCH: 3,
    
    // Commission rate for product promotion
    DEFAULT_COMMISSION_RATE: 0.07, // 7%
    
    // Account statuses
    ACCOUNT_STATUS: {
      UNVERIFIED: 'UNVERIFIED',
      ACTIVE: 'ACTIVE',
      SUSPENDED: 'SUSPENDED',
    },
    
    // Transaction types
    TRANSACTION_TYPES: {
      ACCOUNT_ACTIVATION: 'ACCOUNT_ACTIVATION',
      WITHDRAW_TO_MPESA: 'WITHDRAW_TO_MPESA',
      LEVEL_1_REFERRAL_BONUS: 'LEVEL_1_REFERRAL_BONUS',
      LEVEL_2_REFERRAL_BONUS: 'LEVEL_2_REFERRAL_BONUS',
      LEVEL_3_REFERRAL_BONUS: 'LEVEL_3_REFERRAL_BONUS',
      WEEKLY_CHALLENGE_BONUS: 'WEEKLY_CHALLENGE_BONUS',
      ADS_VIEWING_BONUS: 'ADS_VIEWING_BONUS',
      WHEEL_SPIN_BONUS: 'WHEEL_SPIN_BONUS',
      COMMISSION_BONUS: 'COMMISSION_BONUS',
      ACADEMIC_WRITING_BONUS: 'ACADEMIC_WRITING_BONUS',
    },
    
    // Transaction statuses
    TRANSACTION_STATUS: {
      PENDING: 'PENDING',
      CONFIRMED: 'CONFIRMED',
      FAILED: 'FAILED',
      CANCELLED: 'CANCELLED',
    },
    
    // Withdrawal statuses
    WITHDRAWAL_STATUS: {
      PENDING: 'PENDING',
      PROCESSING: 'PROCESSING',
      COMPLETED: 'COMPLETED',
      REJECTED: 'REJECTED',
    },
    
    // Earnings statuses
    EARNINGS_STATUS: {
      PENDING: 'PENDING',
      AVAILABLE: 'AVAILABLE',
    },
    
    // JWT expiration times
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    
    // Rate limiting
    RATE_LIMITS: {
      GENERAL: 100, // requests per 15 minutes
      AUTH: 10,     // auth requests per 15 minutes
      PASSWORD: 5,  // password attempts per hour
    },
    
    // Pagination
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    
    // Referral code generation
    REFERRAL_CODE_LENGTH: 8,
    
    // Phone number validation regex (Kenyan format)
    PHONE_REGEX: /^(\+254|254|0)([7-9][0-9]{8})$/,
    
    // Password requirements
    PASSWORD_MIN_LENGTH: 6,
    
    // M-Pesa configuration
    MPESA: {
      ENVIRONMENT: process.env.MPESA_ENVIRONMENT || 'sandbox',
      BUSINESS_SHORT_CODE: process.env.MPESA_BUSINESS_SHORT_CODE || '174379',
      PASSKEY: process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
      CALLBACK_URL: process.env.MPESA_CALLBACK_URL || 'https://your-domain.com/api/mpesa/callback',
      TIMEOUT_URL: process.env.MPESA_TIMEOUT_URL || 'https://your-domain.com/api/mpesa/timeout',
    },
    
    // Error messages
    ERRORS: {
      UNAUTHORIZED: 'Unauthorized access',
      FORBIDDEN: 'Access forbidden',
      NOT_FOUND: 'Resource not found',
      VALIDATION_ERROR: 'Validation error',
      PHONE_EXISTS: 'Phone number already registered',
      EMAIL_EXISTS: 'Email address already registered',
      INVALID_CREDENTIALS: 'Invalid phone number or password',
      ACCOUNT_NOT_ACTIVATED: 'Account not activated. Please pay activation fee.',
      INSUFFICIENT_BALANCE: 'Insufficient balance for withdrawal',
      MIN_WITHDRAWAL: `Minimum withdrawal amount is KSH ${1000}`,
      REFERRAL_CODE_NOT_FOUND: 'Invalid referral code',
      SELF_REFERRAL: 'Cannot refer yourself',
      ALREADY_REFERRED: 'User already has a referrer',
      TASK_ALREADY_COMPLETED: 'Task already completed today',
      INVALID_PHONE_FORMAT: 'Invalid phone number format',
      INVALID_EMAIL_FORMAT: 'Invalid email format',
      WEAK_PASSWORD: `Password must be at least ${6} characters long`,
    },
    
    // Success messages
    SUCCESS: {
      REGISTRATION: 'Registration successful. Please verify your phone number.',
      LOGIN: 'Login successful',
      LOGOUT: 'Logout successful',
      PHONE_VERIFIED: 'Phone number verified successfully',
      ACCOUNT_ACTIVATED: 'Account activated successfully',
      WITHDRAWAL_REQUESTED: 'Withdrawal request submitted successfully',
      TASK_COMPLETED: 'Task completed successfully',
      PASSWORD_CHANGED: 'Password changed successfully',
    },
    
    // Product categories
    PRODUCT_CATEGORIES: {
      BLOG_WEBSITE: 'blog_website',
      COMPANY_WEBSITE: 'company_website',
      DERIV_TRADING: 'deriv_trading',
      TRADING_BOT: 'trading_bot',
      ACADEMIC_WRITING: 'academic_writing',
    },
    
    // Time zones
    TIMEZONE: 'Africa/Nairobi',
    
    // Cron job schedules
    CRON_SCHEDULES: {
      DAILY_RESET: '0 0 * * *',      // Every day at midnight
      WEEKLY_RESET: '0 0 * * 0',     // Every Sunday at midnight
      STATS_CALCULATION: '0 1 * * *', // Every day at 1 AM
    },
  };