import express from 'express';
import { activationService } from '../services/activationService.js';
import { mpesaService } from '../services/mpesaService.js';

const router = express.Router();

// M-Pesa activation callback
router.post('/activation-callback', async (req, res) => {
  try {
    console.log('M-Pesa activation callback received:', JSON.stringify(req.body, null, 2));

    const callbackData = req.body;
    const processedCallback = await mpesaService.processActivationCallback(callbackData);

    if (processedCallback.success) {
      // Process successful activation
      // Note: In a real implementation, you would need to map checkoutRequestId to userId
      // This could be done by storing the mapping in Redis temporarily
      const result = await activationService.processSuccessfulActivation(
        processedCallback.checkoutRequestId,
        processedCallback.mpesaReceiptNumber
      );

      console.log('Account activation successful:', result);
    } else {
      console.log('M-Pesa payment failed:', processedCallback);
    }

    // Always respond with success to M-Pesa
    res.json({
      ResultCode: 0,
      ResultDesc: 'Success',
    });
  } catch (error) {
    console.error('Error processing M-Pesa callback:', error);
    
    // Still respond with success to M-Pesa to avoid retries
    res.json({
      ResultCode: 0,
      ResultDesc: 'Success',
    });
  }
});

// M-Pesa timeout callback
router.post('/timeout', (req, res) => {
  console.log('M-Pesa timeout received:', req.body);
  res.json({
    ResultCode: 0,
    ResultDesc: 'Success',
  });
});

export default router; 