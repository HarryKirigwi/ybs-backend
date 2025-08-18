import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { prisma } from '../lib/prisma.js';
import { protect } from '../middleware/auth.js';
import { CONSTANTS } from '../utils/constants.js';
import crypto from 'crypto';
import { mpesaService } from '../services/mpesaService.js';

const router = express.Router();

// Authenticated: GET /api/sales/my - list my sales
router.get('/my', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const sales = await prisma.sale.findMany({
    where: { userId },
    orderBy: { saleDate: 'desc' },
    include: {
      product: { select: { id: true, name: true, category: true, commissionRate: true, basePrice: true } },
    },
  });

  const totals = sales.reduce((acc, s) => {
    acc.count += 1;
    acc.volume += Number(s.saleAmount);
    acc.commission += Number(s.commissionAmount);
    acc.confirmed += s.isConfirmed ? Number(s.commissionAmount) : 0;
    return acc;
  }, { count: 0, volume: 0, commission: 0, confirmed: 0 });

  res.json({ success: true, data: { sales, totals } });
}));

// Public/checkout system: POST /api/sales - record sale intent
router.post('/', asyncHandler(async (req, res) => {
  const { productId, saleAmount, customerInfo, referralCode, idempotencyKey } = req.body || {};

  if (!productId || !saleAmount || !referralCode) {
    return res.status(400).json({ success: false, error: 'productId, saleAmount and referralCode are required' });
  }

  // Optional idempotency handling
  const key = idempotencyKey || crypto.createHash('sha256').update(`${productId}:${saleAmount}:${referralCode}`).digest('hex');

  // Find referrer by referral code
  const referrer = await prisma.user.findUnique({ where: { referralCode } });
  if (!referrer) {
    return res.status(400).json({ success: false, error: 'Invalid referral code' });
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isActive) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const amount = Number(saleAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid sale amount' });
  }

  // Basic sanity check against basePrice (allow 50%-200% range)
  const base = Number(product.basePrice);
  if (base > 0 && (amount < base * 0.5 || amount > base * 2.0)) {
    return res.status(400).json({ success: false, error: 'Sale amount out of expected range' });
  }

  const commissionRate = Number(product.commissionRate ?? CONSTANTS.DEFAULT_COMMISSION_RATE);
  const commissionAmount = Math.round(amount * commissionRate * 100) / 100;

  // Upsert by idempotency key stored in metadata
  const existing = await prisma.sale.findFirst({ where: { userId: referrer.id, productId: product.id, saleAmount: amount, isConfirmed: false } });
  if (existing) {
    return res.json({ success: true, data: existing, message: 'Sale already recorded' });
  }

  const sale = await prisma.sale.create({
    data: {
      userId: referrer.id,
      productId: product.id,
      saleAmount: amount,
      commissionAmount,
      commissionRate,
      customerInfo: customerInfo || null,
      isConfirmed: false,
    },
  });

  res.json({ success: true, data: sale, message: 'Sale recorded. Awaiting confirmation.' });
}));

// Admin/webhook: POST /api/sales/:id/confirm - confirm sale and credit commission
router.post('/:id/confirm', asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Optional: verify a shared secret header for webhook
  const secret = process.env.SALES_WEBHOOK_SECRET;
  if (secret && req.headers['x-webhook-secret'] !== secret) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const sale = await prisma.sale.findUnique({ where: { id }, include: { product: true } });
  if (!sale) {
    return res.status(404).json({ success: false, error: 'Sale not found' });
  }
  if (sale.isConfirmed) {
    return res.json({ success: true, data: sale, message: 'Sale already confirmed' });
  }

  // Confirm sale
  const confirmed = await prisma.sale.update({ where: { id }, data: { isConfirmed: true, confirmedAt: new Date() } });

  // Create commission transaction and update balances atomically
  const result = await prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        userId: confirmed.userId,
        type: CONSTANTS.TRANSACTION_TYPES.COMMISSION_BONUS,
        amount: confirmed.commissionAmount,
        status: CONSTANTS.TRANSACTION_STATUS.CONFIRMED,
        description: `11% commission from sale of ${sale.product?.name || 'product'}`,
        metadata: { saleId: confirmed.id, productId: confirmed.productId },
        confirmedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: confirmed.userId },
      data: {
        availableBalance: { increment: confirmed.commissionAmount },
        totalEarned: { increment: confirmed.commissionAmount },
      },
    });

    return txn;
  });

  res.json({ success: true, data: { sale: confirmed, transaction: result } });
}));

export default router;

// POST /api/sales/:id/pay - initiate M-Pesa payment for a sale (user triggers)
router.post('/:id/pay', protect, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { phoneNumber } = req.body || {};

  const sale = await prisma.sale.findUnique({ where: { id }, include: { product: true, user: true } });
  if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
  if (sale.userId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });
  if (sale.isConfirmed) return res.json({ success: true, data: { alreadyConfirmed: true } });

  const phone = phoneNumber || sale.user.phoneNumber;
  const result = await mpesaService.initiateProductPayment(
    phone,
    Number(sale.saleAmount),
    `SALE_${sale.id}`,
    `Payment for ${sale.product?.name || 'product'}`
  );

  res.json({ success: true, data: result });
}));


