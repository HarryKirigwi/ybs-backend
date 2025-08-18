import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create default admin user
  const adminPassword = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD || 'admin123', 12);
  
  const admin = await prisma.admin.upsert({
    where: { email: 'admin@yourplatform.com' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@yourplatform.com',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'super_admin',
    },
  });

  // Create system configuration
  const configs = [
    { key: 'ACTIVATION_FEE', value: '600', description: 'Account activation fee in KSH' },
    { key: 'MIN_WITHDRAWAL', value: '1000', description: 'Minimum withdrawal amount in KSH' },
    { key: 'REFERRAL_L1_BONUS', value: '300', description: 'Level 1 referral bonus in KSH' },
    { key: 'REFERRAL_L2_BONUS', value: '100', description: 'Level 2 referral bonus in KSH' },
    { key: 'REFERRAL_L3_BONUS', value: '50', description: 'Level 3 referral bonus in KSH' },
    { key: 'WEEKLY_CHALLENGE_BONUS', value: '100', description: 'Weekly challenge completion bonus in KSH' },
    { key: 'SILVER_REFERRAL_THRESHOLD', value: '10', description: 'Referrals needed for Silver level' },
    { key: 'BRONZE_REFERRAL_THRESHOLD', value: '20', description: 'Referrals needed for Bronze level' },
    { key: 'GOLD_REFERRAL_THRESHOLD', value: '21', description: 'Referrals needed for Gold level' },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value },
      create: config,
    });
  }

  // Create sample products for promotion
  const products = [
    {
      name: 'Professional Blog Website',
      description: 'Custom blog website with SEO optimization',
      category: 'blog_website',
      commissionRate: 0.11,
      basePrice: 20000,
    },
    {
      name: 'Company Website Package',
      description: 'Complete business website with CMS',
      category: 'company_website',
      commissionRate: 0.11,
      basePrice: 35000,
    },
    {
      name: 'Company Custom System',
      description: 'Custom business system (CRM/ERP/Portal)',
      category: 'custom_system',
      commissionRate: 0.11,
      basePrice: 45000,
    },
    {
      name: 'Mobile App Package',
      description: 'Cross-platform mobile application',
      category: 'mobile_app',
      commissionRate: 0.11,
      basePrice: 80000,
    },
    {
      name: 'Coding Classes',
      description: 'Full-stack coding classes for beginners',
      category: 'coding_classes',
      commissionRate: 0.11,
      basePrice: 15000,
    },
    {
      name: 'Academic Writing Classes',
      description: 'Professional academic writing training',
      category: 'academic_writing',
      commissionRate: 0.11,
      basePrice: 2000,
    },
    {
      name: 'Forex Trading Classes',
      description: 'Comprehensive forex trading mentorship',
      category: 'forex_trading',
      commissionRate: 0.11,
      basePrice: 12000,
    },
    {
      name: 'Deriv Trading Course',
      description: 'Comprehensive Deriv forex and binary options trading course',
      category: 'deriv_trading',
      commissionRate: 0.11,
      basePrice: 12000,
    },
    {
      name: 'Binary Options Trading Bot',
      description: 'Binary options trading bot license',
      category: 'trading_bot',
      commissionRate: 0.11,
      basePrice: 5000,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { name: product.name },
      update: {
        description: product.description,
        category: product.category,
        commissionRate: product.commissionRate,
        basePrice: product.basePrice,
        isActive: true,
      },
      create: product,
    });
  }

  console.log('Database seeded successfully!');
  console.log(`Admin user created: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });