import axios from 'axios';
import { generateMpesaTimestamp, generateMpesaPassword } from '../utils/helpers.js';

class MpesaService {
  constructor() {
    this.baseUrl = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke';
    this.shortCode = process.env.MPESA_BUSINESS_SHORT_CODE;
    this.passkey = process.env.MPESA_PASSKEY;
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    this.timeoutUrl = process.env.MPESA_TIMEOUT_URL;

    // Validate required environment variables
    this.validateConfig();
  }

  // Validate configuration
  validateConfig() {
    const required = [
      'MPESA_BUSINESS_SHORT_CODE',
      'MPESA_PASSKEY', 
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET',
      'MPESA_CALLBACK_URL'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required M-PESA environment variables: ${missing.join(', ')}`);
    }
  }

  // Get access token with caching
  async getAccessToken() {
    try {
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      
      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
          },
          timeout: 10000, // 10 second timeout
        }
      );

      if (!response.data.access_token) {
        throw new Error('No access token received from M-PESA API');
      }

      return response.data.access_token;
    } catch (error) {
      console.error('Error getting M-Pesa access token:', error.response?.data || error.message);
      throw new Error('Failed to get M-Pesa access token');
    }
  }

  // Initiate STK Push for account activation
  async initiateAccountActivation(phoneNumber, amount, reference = null) {
    try {
      // Validate inputs
      if (!phoneNumber || !amount) {
        throw new Error('Phone number and amount are required');
      }

      if (amount < 1) {
        throw new Error('Amount must be greater than 0');
      }

      // Validate and format phone number
      const formattedPhone = this.validatePhoneNumber(phoneNumber);
      
      const accessToken = await this.getAccessToken();
      const timestamp = generateMpesaTimestamp();
      const password = generateMpesaPassword(this.shortCode, this.passkey, timestamp);
      
      const payload = {
        BusinessShortCode: this.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline', // FIXED: Use PayBill instead of BuyGoods
        Amount: amount,
        PartyA: formattedPhone,     // FIXED: Customer phone number
        PartyB: this.shortCode,     // FIXED: Your business shortcode
        PhoneNumber: formattedPhone,
        CallBackURL: `${this.callbackUrl}/api/mpesa/activation-callback`,
        AccountReference: reference || `YBS_ACT_${Date.now()}`, // Unique reference
        TransactionDesc: 'YBS Account Activation Fee',
      };

      console.log('🚀 Initiating M-PESA STK Push:', {
        phone: formattedPhone,
        amount,
        reference: payload.AccountReference
      });

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout for STK push
        }
      );

      // Log successful STK push initiation
      console.log('✅ STK Push initiated successfully:', {
        checkoutRequestId: response.data.CheckoutRequestID,
        responseCode: response.data.ResponseCode
      });

      return {
        success: true,
        checkoutRequestId: response.data.CheckoutRequestID,
        merchantRequestId: response.data.MerchantRequestID,
        responseCode: response.data.ResponseCode,
        responseDescription: response.data.ResponseDescription,
        customerMessage: response.data.CustomerMessage,
      };
    } catch (error) {
      console.error('❌ Error initiating M-Pesa STK push:', error.response?.data || error.message);
      
      // Handle specific M-PESA error codes
      if (error.response?.data?.ResponseCode) {
        const errorCode = error.response.data.ResponseCode;
        const errorMessage = this.getMpesaErrorMessage(errorCode);
        throw new Error(errorMessage);
      }
      
      throw new Error('Failed to initiate M-Pesa payment. Please try again.');
    }
  }

  // Process activation callback
  async processActivationCallback(callbackData) {
    try {
      console.log('📱 Processing M-PESA callback:', JSON.stringify(callbackData, null, 2));

      const {
        Body: {
          stkCallback: {
            CheckoutRequestID,
            MerchantRequestID,
            ResultCode,
            ResultDesc,
            CallbackMetadata,
          },
        },
      } = callbackData;

      if (ResultCode === 0) {
        // Payment successful
        const metadata = CallbackMetadata?.Item || [];
        const mpesaReceiptNumber = metadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
        const transactionDate = metadata.find(item => item.Name === 'TransactionDate')?.Value;
        const amount = metadata.find(item => item.Name === 'Amount')?.Value;
        const phoneNumber = metadata.find(item => item.Name === 'PhoneNumber')?.Value;

        console.log('✅ M-PESA payment successful:', {
          checkoutRequestId: CheckoutRequestID,
          mpesaReceiptNumber,
          amount,
          phoneNumber
        });

        return {
          success: true,
          checkoutRequestId: CheckoutRequestID,
          merchantRequestId: MerchantRequestID,
          mpesaReceiptNumber,
          transactionDate,
          phoneNumber,
          amount,
          resultCode: ResultCode,
          resultDesc: ResultDesc,
        };
      } else {
        // Payment failed
        console.log('❌ M-PESA payment failed:', {
          checkoutRequestId: CheckoutRequestID,
          resultCode: ResultCode,
          resultDesc: ResultDesc
        });

        return {
          success: false,
          checkoutRequestId: CheckoutRequestID,
          merchantRequestId: MerchantRequestID,
          resultCode: ResultCode,
          resultDesc: ResultDesc,
        };
      }
    } catch (error) {
      console.error('❌ Error processing M-Pesa callback:', error);
      throw new Error('Failed to process M-Pesa callback');
    }
  }

  // Get user-friendly error messages for M-PESA error codes
  getMpesaErrorMessage(errorCode) {
    const errorMessages = {
      '1': 'Insufficient funds in your M-PESA account',
      '2': 'Less than minimum transaction value',
      '3': 'More than maximum transaction value',
      '4': 'Would exceed daily transfer limit',
      '5': 'Would exceed minimum balance',
      '6': 'Unresolved primary party',
      '7': 'Unresolved receiver party',
      '8': 'Would exceed maximum balance',
      '11': 'Debit account invalid',
      '12': 'Credit account invalid',
      '13': 'Unresolved debit account',
      '14': 'Unresolved credit account',
      '15': 'Duplicate detected',
      '17': 'Internal failure',
      '20': 'Unresolved initiator',
      '26': 'Traffic blocked',
      '1001': 'Balance would be below minimum',
      '1019': 'Transaction failed',
      '9999': 'Request timeout'
    };

    return errorMessages[errorCode] || `M-PESA error code: ${errorCode}`;
  }

  // Enhanced phone number validation
  validatePhoneNumber(phoneNumber) {
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Remove all non-digit characters
    const formatted = phoneNumber.replace(/\D/g, '');
    
    // Handle different formats
    if (formatted.startsWith('254') && formatted.length === 12) {
      return formatted;
    } else if (formatted.startsWith('0') && formatted.length === 10) {
      return '254' + formatted.substring(1);
    } else if (formatted.length === 9 && /^[17]/.test(formatted)) {
      return '254' + formatted;
    }
    
    throw new Error('Invalid phone number format. Use format: 254XXXXXXXXX, 0XXXXXXXXX, or XXXXXXXXX');
  }

  // Query transaction status
  async queryTransactionStatus(checkoutRequestId) {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = generateMpesaTimestamp();
      const password = generateMpesaPassword(this.shortCode, this.passkey, timestamp);

      const payload = {
        BusinessShortCode: this.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      };

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        resultCode: response.data.ResultCode,
        resultDesc: response.data.ResultDesc,
        merchantRequestId: response.data.MerchantRequestID,
        checkoutRequestId: response.data.CheckoutRequestID,
      };
    } catch (error) {
      console.error('Error querying M-Pesa transaction status:', error.response?.data || error.message);
      throw new Error('Failed to query transaction status');
    }
  }
}

export const mpesaService = new MpesaService();