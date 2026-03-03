import { Request, Response } from 'express';
import { PrismaClient, Role, InspectionStatus, TransactionStatus, CarStatus, OfferStatus, TransactionType, UserStatus } from '@prisma/client';
import { sendEmail } from '../utils/notifications';

const prisma = new PrismaClient();

export const getSystemConfig = async (req: Request, res: Response) => {
  try {
    const configs = await prisma.systemConfig.findMany();
    const configMap: any = {};
    configs.forEach(c => {
      configMap[c.key] = c.value;
    });
    res.json(configMap);
  } catch (error) {
    console.error('Error fetching system config:', error);
    res.status(500).json({ error: 'Failed to fetch system configuration' });
  }
};

export const updateSystemConfig = async (req: Request, res: Response) => {
  try {
    const { configs } = req.body; // Expecting an object of key-value pairs
    
    const updatePromises = Object.entries(configs).map(([key, value]) => {
      return prisma.systemConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
    });

    await Promise.all(updatePromises);
    res.json({ message: 'Configuration updated successfully' });
  } catch (error) {
    console.error('Error updating system config:', error);
    res.status(500).json({ error: 'Failed to update system configuration' });
  }
};

export const testSMTPDeliverability = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const subject = "SMTP Test Deliverability - Huce Automarts";
    const body = `This is a test email from Huce Automarts to verify your SMTP configuration. 
    If you received this, your email settings are working correctly.
    
    Timestamp: ${new Date().toISOString()}`;

    const result = await sendEmail(email, subject, body);
    
    if (result.success) {
      res.json({ message: 'Test email sent successfully' });
    } else {
      res.status(500).json({ 
        error: 'Failed to send test email. Check your SMTP settings.',
        details: result.error 
      });
    }
  } catch (error: any) {
    console.error('Error testing SMTP:', error);
    res.status(500).json({ error: 'Failed to test SMTP deliverability', details: error.message });
  }
};

export const getAdminStats = async (req: Request, res: Response) => {
  try {
    const { year, period } = req.query as { year?: string; period?: string };
    const week = period; // Alias for backward compatibility in logic
    const now = new Date();

    // Revenue Year Logic
    const targetYear = year ? parseInt(year, 10) : now.getFullYear();
    const startOfYear = new Date(targetYear, 0, 1);
    const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59, 999);
    
    const startOfPrevYear = new Date(targetYear - 1, 0, 1);
    const endOfPrevYear = new Date(targetYear - 1, 11, 31, 23, 59, 59, 999);

    // Listings Period Logic
    let startOfPeriod = new Date(now);
    let endOfPeriod = new Date(now);
    let startOfPrevPeriod = new Date(now);
    let endOfPrevPeriod = new Date(now);

    if (week === 'Last Month') {
      // Current selected period: Last Month
      startOfPeriod = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endOfPeriod = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      
      // Previous period for comparison: Month before last
      startOfPrevPeriod = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      endOfPrevPeriod = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
    } else if (week === 'Last Week') {
      // Current selected period: Last Week
      startOfPeriod.setDate(now.getDate() - now.getDay() - 7);
      startOfPeriod.setHours(0, 0, 0, 0);
      endOfPeriod = new Date(startOfPeriod);
      endOfPeriod.setDate(endOfPeriod.getDate() + 6);
      endOfPeriod.setHours(23, 59, 59, 999);

      // Previous period: Week before last
      startOfPrevPeriod = new Date(startOfPeriod);
      startOfPrevPeriod.setDate(startOfPrevPeriod.getDate() - 7);
      endOfPrevPeriod = new Date(startOfPrevPeriod);
      endOfPrevPeriod.setDate(endOfPrevPeriod.getDate() + 6);
      endOfPrevPeriod.setHours(23, 59, 59, 999);
    } else {
      // Default: This Week
      startOfPeriod.setDate(now.getDate() - now.getDay());
      startOfPeriod.setHours(0, 0, 0, 0);
      endOfPeriod = new Date(startOfPeriod);
      endOfPeriod.setDate(endOfPeriod.getDate() + 6);
      endOfPeriod.setHours(23, 59, 59, 999);

      // Previous period: Last Week
      startOfPrevPeriod = new Date(startOfPeriod);
      startOfPrevPeriod.setDate(startOfPrevPeriod.getDate() - 7);
      endOfPrevPeriod = new Date(startOfPrevPeriod);
      endOfPrevPeriod.setDate(endOfPrevPeriod.getDate() + 6);
      endOfPrevPeriod.setHours(23, 59, 59, 999);
    }

    const [
      userCounts,
      listingCounts,
      ticketCounts,
      totalRevenueResult,
      periodRevenueResult,
      prevPeriodRevenueResult,
      periodListingsResult,
      prevPeriodListingsResult,
      pendingInspections,
      recentTransactions,
      monthlyRevenue,
      weeklyListings,
      bestSellers
    ] = await Promise.all([
      // 1. User counts
      prisma.user.groupBy({ by: ['role'], _count: true }),
      // 2. Listing counts
      prisma.car.groupBy({ by: ['status'], _count: true }),
      // 3. Ticket counts
      prisma.supportTicket.groupBy({ by: ['status'], _count: true }),
      // 4. Total revenue
      prisma.transaction.aggregate({
        where: { status: TransactionStatus.SUCCESS },
        _sum: { amount: true }
      }),
      // 5. Period revenue
      prisma.transaction.aggregate({
        where: { 
          status: TransactionStatus.SUCCESS,
          createdAt: { gte: startOfYear, lte: endOfYear }
        },
        _sum: { amount: true }
      }),
      // 6. Previous period revenue
      prisma.transaction.aggregate({
        where: { 
          status: TransactionStatus.SUCCESS,
          createdAt: { gte: startOfPrevYear, lte: endOfPrevYear }
        },
        _sum: { amount: true }
      }),
      // 7. Period listings
      prisma.car.count({
        where: { createdAt: { gte: startOfPeriod, lte: endOfPeriod } }
      }),
      // 8. Previous period listings
      prisma.car.count({
        where: { createdAt: { gte: startOfPrevPeriod, lte: endOfPrevPeriod } }
      }),
      // 9. Pending inspections
      prisma.inspection.count({ where: { status: InspectionStatus.REQUESTED } }),
      // 10. Recent transactions
      prisma.transaction.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { user: true }
      }),
      // 11. Monthly revenue
      prisma.transaction.findMany({
        where: {
          status: TransactionStatus.SUCCESS,
          createdAt: { gte: startOfYear, lte: endOfYear }
        },
        select: {
          amount: true,
          createdAt: true
        }
      }),
      // 12. Period listings (for chart)
      prisma.car.findMany({
        where: { createdAt: { gte: startOfPeriod, lte: endOfPeriod } },
        select: {
          createdAt: true
        }
      }),
      // 13. Best Sellers
      prisma.user.findMany({
        where: { role: Role.SELLER },
        take: 5,
        include: {
          cars: { where: { status: CarStatus.SOLD } },
          _count: {
            select: { 
              cars: true,
              offersReceived: { where: { status: OfferStatus.ACCEPTED } }
            }
          }
        },
      })
    ]);

    // Calculate percentage changes
    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const revenueChange = calcChange(
      Number(periodRevenueResult._sum.amount || 0),
      Number(prevPeriodRevenueResult._sum.amount || 0)
    );

    const listingsChange = calcChange(periodListingsResult, prevPeriodListingsResult);

    // Process monthly revenue data
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueByMonth = months.map((month, index) => {
      const total = monthlyRevenue
        .filter(r => new Date(r.createdAt).getMonth() === index)
        .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      return { month, total };
    });

    // Process period listings data for chart
    let listingsChartData;
    if (week === 'Last Month') {
      const daysInMonth = new Date(startOfPeriod.getFullYear(), startOfPeriod.getMonth() + 1, 0).getDate();
      listingsChartData = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const count = weeklyListings
          .filter(l => new Date(l.createdAt).getDate() === day)
          .length;
        return { label: day.toString(), count };
      });
    } else {
      const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      listingsChartData = days.map((day, index) => {
        const count = weeklyListings
          .filter(l => new Date(l.createdAt).getDay() === index)
          .length;
        return { label: day, count };
      });
    }

    // Process best sellers
    const bestSellersWithEarnings = await Promise.all(bestSellers.map(async (seller) => {
      const earnings = await prisma.transaction.aggregate({
        where: {
          userId: seller.id,
          status: TransactionStatus.SUCCESS,
          type: 'SALE'
        },
        _sum: { amount: true }
      });

      const unsold = await prisma.car.count({
        where: {
          sellerId: seller.id,
          status: CarStatus.AVAILABLE
        }
      });

      const offers = await prisma.offer.count({
        where: { sellerId: seller.id }
      });

      return {
        id: seller.id,
        name: `${seller.firstName} ${seller.lastName}`,
        avatar: seller.avatar,
        sold: seller.cars.length,
        unsold,
        offers,
        earnings: earnings._sum.amount || 0
      };
    }));

    const users = {
      total: userCounts.reduce((acc, curr) => acc + curr._count, 0),
      buyers: userCounts.find(u => u.role === Role.BUYER)?._count || 0,
      sellers: userCounts.find(u => u.role === Role.SELLER)?._count || 0,
      inspectors: userCounts.find(u => u.role === Role.INSPECTOR)?._count || 0,
    };

    const listings = {
      total: listingCounts.reduce((acc, curr) => acc + curr._count, 0),
      active: listingCounts.find(l => l.status === CarStatus.AVAILABLE)?._count || 0,
      sold: listingCounts.find(l => l.status === CarStatus.SOLD)?._count || 0,
      pending: listingCounts.find(l => l.status === CarStatus.PENDING)?._count || 0,
    };

    const tickets = {
      total: ticketCounts.reduce((acc, curr) => acc + curr._count, 0),
      resolved: ticketCounts.find(t => t.status === 'RESOLVED')?._count || 0,
      unresolved: ticketCounts.find(t => t.status === 'OPEN')?._count || 0,
    };

    res.json({
      users,
      listings,
      tickets,
      revenue: totalRevenueResult._sum.amount || 0,
      periodRevenue: periodRevenueResult._sum.amount || 0,
      revenueChange,
      periodListings: periodListingsResult,
      listingsChange,
      pendingInspections,
      recentTransactions: recentTransactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        status: t.status,
        createdAt: t.createdAt,
        user: `${t.user.firstName} ${t.user.lastName}`
      })),
      revenueChart: revenueByMonth,
      listingsChart: listingsChartData,
      bestSellers: bestSellersWithEarnings
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin statistics' });
  }
};

export const getAdminFinanceSummary = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const yearParam = req.query.year ? Number(req.query.year) : now.getFullYear();
    const targetYear = Number.isFinite(yearParam) ? yearParam : now.getFullYear();
    const startOfMonth = new Date(targetYear, now.getMonth(), 1);
    const endOfMonth = new Date(targetYear, now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfYear = new Date(targetYear, 0, 1);
    const endOfYear = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    const [
      totalRevenueResult,
      monthlyRevenueResult,
      typeTotals,
      monthlySaleResult,
      yearlyTransactions
    ] = await Promise.all([
      prisma.transaction.aggregate({
        where: { status: TransactionStatus.SUCCESS },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: {
          status: TransactionStatus.SUCCESS,
          createdAt: { gte: startOfMonth, lte: endOfMonth }
        },
        _sum: { amount: true }
      }),
      prisma.transaction.groupBy({
        by: ['type'],
        where: { status: TransactionStatus.SUCCESS },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: {
          status: TransactionStatus.SUCCESS,
          type: TransactionType.SALE,
          createdAt: { gte: startOfMonth, lte: endOfMonth }
        },
        _sum: { amount: true }
      }),
      prisma.transaction.findMany({
        where: {
          status: TransactionStatus.SUCCESS,
          createdAt: { gte: startOfYear, lte: endOfYear }
        },
        select: {
          amount: true,
          createdAt: true
        }
      })
    ]);

    const typeTotalsMap = typeTotals.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = Number(item._sum.amount || 0);
      return acc;
    }, {});

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const revenueByMonth = months.map((month, index) => {
      const total = yearlyTransactions
        .filter(r => new Date(r.createdAt).getMonth() === index)
        .reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      return { month, total };
    });

    res.json({
      totals: {
        totalRevenue: Number(totalRevenueResult._sum.amount || 0),
        monthlyRevenue: Number(monthlyRevenueResult._sum.amount || 0),
        subscriptionRevenue: typeTotalsMap[TransactionType.DEPOSIT] || 0,
        escrowFees: typeTotalsMap[TransactionType.PURCHASE] || 0,
        totalEarnings: typeTotalsMap[TransactionType.SALE] || 0,
        monthlyEarnings: Number(monthlySaleResult._sum.amount || 0),
        subscriptionEarnings: typeTotalsMap[TransactionType.INSPECTION_EARNING] || 0,
        escrowEarnings: typeTotalsMap[TransactionType.INSPECTION_FEE] || 0
      },
      revenueChart: revenueByMonth
    });
  } catch (error) {
    console.error('Error fetching admin finance summary:', error);
    res.status(500).json({ error: 'Failed to fetch finance summary' });
  }
};

export const getAdminUsers = async (req: Request, res: Response) => {
  try {
    const { role, status, search, page = '1', limit = '10' } = req.query as { 
      role?: string; 
      status?: string; 
      search?: string; 
      page?: string; 
      limit?: string 
    };
    const p = parseInt(page, 10);
    const l = parseInt(limit, 10);
    const skip = (p - 1) * l;

    const where: any = {};
    if (role) {
      const roleUpper = role.toUpperCase();
      if (roleUpper === 'BUYERS') where.role = Role.BUYER;
      else if (roleUpper === 'SELLERS') where.role = Role.SELLER;
      else if (roleUpper === 'INSPECTOR') where.role = Role.INSPECTOR;
      else if (roleUpper === 'STAFF') where.role = Role.STAFF;
      else if (roleUpper === 'ADMIN') where.role = Role.ADMIN;
    }

    if (status && status !== 'All') {
      const normalizedStatus =
        status === 'Active' || status === 'ACTIVE'
          ? UserStatus.ACTIVE
          : status === 'Pending' || status === 'PENDING'
            ? UserStatus.PENDING
            : UserStatus.DEACTIVATED;
      where.status = normalizedStatus;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          sellerProfile: true,
          inspectorProfile: true,
          _count: {
            select: {
              offersMade: true,
              offersReceived: true,
              transactions: { where: { status: TransactionStatus.SUCCESS } },
              cars: true,
              inspections: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: l
      }),
      prisma.user.count({ where })
    ]);

    const formattedUsers = users.map((user: any) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      businessName: user.sellerProfile?.companyName || 'N/A',
      officeName: user.inspectorProfile?.officeName || 'N/A',
      email: user.email,
      phone: user.phone || 'N/A',
      avatar: user.avatar,
      offersSubmitted: user.role === Role.BUYER ? user._count.offersMade : user._count.offersReceived,
      totalPurchases: user._count.transactions,
      totalListings: user._count.cars,
      totalInspections: user._count.inspections,
      registrationDate: new Date(user.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).replace(/ /g, ' '),
      status: user.status
    }));

    res.json({
      users: formattedUsers,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l)
      }
    });
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const getAdminUserDetails = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        sellerProfile: true,
        inspectorProfile: true,
        _count: {
          select: {
            offersMade: true,
            offersReceived: true,
            transactions: { where: { status: TransactionStatus.SUCCESS } },
            cars: true,
            inspections: true,
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = user as any;
    const formattedUser = {
      id: u.id,
      name: `${u.firstName} ${u.lastName}`,
      email: u.email,
      phone: u.phone || 'N/A',
      avatar: u.avatar,
      role: u.role,
      offersSubmitted: u.role === Role.BUYER ? u._count?.offersMade || 0 : u._count?.offersReceived || 0,
      totalPurchases: u._count?.transactions || 0,
      registrationDate: new Date(u.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).replace(/ /g, ' '),
      status: user.status
    };

    res.json(formattedUser);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
};

export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { role: true }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const normalizedStatus: UserStatus =
      status === 'Active' || status === 'ACTIVE'
        ? UserStatus.ACTIVE
        : status === 'Pending' || status === 'PENDING'
          ? UserStatus.PENDING
          : UserStatus.DEACTIVATED;
    const isActive = normalizedStatus === 'ACTIVE';

    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { status: normalizedStatus }
      }),
      ...(existingUser.role === Role.SELLER
        ? [
            prisma.sellerProfile.updateMany({
              where: { userId: id },
              data: { verified: isActive }
            })
          ]
        : [])
    ]);

    res.json(user);
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { firstName, lastName, email, phone } = req.body;
    
    const user = await prisma.user.update({
      where: { id },
      data: {
        firstName,
        lastName,
        email,
        phone
      }
    });
    
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const sendUserMessage = async (req: Request, res: Response) => {
  try {
    const receiverId = String(req.params.id);
    const { content } = req.body;
    const adminId = (req as any).user.userId;

    const message = await prisma.message.create({
      data: {
        senderId: adminId,
        receiverId,
        content,
      }
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

export const createAdminUser = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password, phone, role } = req.body;

    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phone,
        role: role as Role,
        verified: true, // Admin created users are verified by default
        wallet: {
          create: {
            balance: 0,
            currency: 'NGN',
          },
        },
        // Create appropriate profile
        ...(role === Role.SELLER && {
          sellerProfile: {
            create: {
              type: 'INDIVIDUAL',
              address: 'N/A',
            },
          },
        }),
        ...(role === Role.BUYER && {
          buyerProfile: {
            create: {},
          },
        }),
        ...(role === Role.INSPECTOR && {
          inspectorProfile: {
            create: {
              officeName: 'Main Office',
            },
          },
        }),
      },
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
};
