import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// GET /api/products - list active products
router.get('/', asyncHandler(async (req, res) => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      commissionRate: true,
      basePrice: true,
    },
  });
  res.json({ success: true, data: { products } });
}));

// GET /api/products/:id - product details
router.get('/:id', asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      commissionRate: true,
      basePrice: true,
      isActive: true,
    },
  });
  if (!product || !product.isActive) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }
  res.json({ success: true, data: product });
}));

export default router;




