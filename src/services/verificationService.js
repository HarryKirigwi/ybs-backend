import { redisClient } from '../lib/redis.js';
import { formatPhoneNumber } from '../utils/helpers.js';

class VerificationService {
  constructor() {
    this.CODE_LENGTH = 6;
    this.CODE_EXPIRY = 10 * 60; // 10 minutes
    this.MAX_ATTEMPTS = 3;
    this.ATTEMPT_WINDOW = 15 * 60; // 15 minutes
    this.RATE_LIMIT_WINDOW = 60; // 1 minute
    this.RATE_LIMIT_MAX = 3; // 3 SMS per minute
  }

  generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async checkRateLimit(phoneNumber) {
    const key = `rate_limit:${phoneNumber}`;
    const attempts = await redisClient.get(key);
    
    if (attempts && parseInt(attempts) >= this.RATE_LIMIT_MAX) {
      throw new Error('Rate limit exceeded. Please wait before requesting another code.');
    }
    
    return true;
  }

  async incrementRateLimit(phoneNumber) {
    const key = `rate_limit:${phoneNumber}`;
    await redisClient.multi()
      .incr(key)
      .expire(key, this.RATE_LIMIT_WINDOW)
      .exec();
  }

  async checkAttempts(phoneNumber) {
    const key = `attempts:${phoneNumber}`;
    const attempts = await redisClient.get(key);
    
    if (attempts && parseInt(attempts) >= this.MAX_ATTEMPTS) {
      throw new Error('Too many verification attempts. Please wait 15 minutes.');
    }
    
    return true;
  }

  async incrementAttempts(phoneNumber) {
    const key = `attempts:${phoneNumber}`;
    await redisClient.multi()
      .incr(key)
      .expire(key, this.ATTEMPT_WINDOW)
      .exec();
  }

  async sendVerificationCode(phoneNumber) {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    // Check rate limits
    await this.checkRateLimit(formattedPhone);
    
    // Generate and store code
    const code = this.generateCode();
    const key = `verification:${formattedPhone}`;
    
    await redisClient.setEx(key, this.CODE_EXPIRY, code);
    await this.incrementRateLimit(formattedPhone);
    
    // Log code in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 Verification Code for ${formattedPhone}: ${code}`);
      console.log(`⏰ Code expires in ${this.CODE_EXPIRY / 60} minutes`);
    }
    
    return { success: true, phoneNumber: formattedPhone, code };
  }

  async verifyCode(phoneNumber, code) {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    // Check attempts
    await this.checkAttempts(formattedPhone);
    
    // Get stored code
    const key = `verification:${formattedPhone}`;
    const storedCode = await redisClient.get(key);
    
    if (!storedCode) {
      await this.incrementAttempts(formattedPhone);
      throw new Error('Verification code expired or not found.');
    }
    
    if (storedCode !== code) {
      await this.incrementAttempts(formattedPhone);
      throw new Error('Invalid verification code.');
    }
    
    // Code is valid - clean up
    await redisClient.del(key);
    await redisClient.del(`attempts:${formattedPhone}`);
    
    return { success: true, phoneNumber: formattedPhone };
  }

  async resendCode(phoneNumber) {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    // Check if there's an existing code
    const key = `verification:${formattedPhone}`;
    const existingCode = await redisClient.get(key);
    
    if (existingCode) {
      // Extend expiry and resend
      await redisClient.expire(key, this.CODE_EXPIRY);
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔐 Resent Verification Code for ${formattedPhone}: ${existingCode}`);
      }
    } else {
      // Generate new code
      return await this.sendVerificationCode(phoneNumber);
    }
    
    return { success: true, phoneNumber: formattedPhone, code: existingCode };
  }
}

export const verificationService = new VerificationService(); 