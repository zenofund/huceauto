import { Request, Response } from 'express';
import { PrismaClient, Role, TransactionStatus, TransactionType } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

// Get all subscription plans
export const getSubscriptionPlans = async (req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' }
    });
    res.json(plans);
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
};

// Get active subscription plans (public)
export const getActiveSubscriptionPlans = async (req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' }
    });
    res.json(plans);
  } catch (error) {
    console.error('Error fetching active subscription plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
};

// Create a new subscription plan
export const createSubscriptionPlan = async (req: Request, res: Response) => {
  try {
    const {
      name,
      price,
      duration,
      features,
      listingLimit,
      featuredListings,
      prioritySupport,
      analyticsAccess
    } = req.body;

    const plan = await prisma.subscriptionPlan.create({
      data: {
        name,
        price,
        duration,
        features,
        listingLimit,
        featuredListings,
        prioritySupport,
        analyticsAccess
      }
    });

    res.status(201).json(plan);
  } catch (error) {
    console.error('Error creating subscription plan:', error);
    res.status(500).json({ error: 'Failed to create subscription plan' });
  }
};

// Update a subscription plan
export const updateSubscriptionPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      price,
      duration,
      features,
      listingLimit,
      featuredListings,
      prioritySupport,
      analyticsAccess,
      isActive
    } = req.body;

    const plan = await prisma.subscriptionPlan.update({
      where: { id: String(id) },
      data: {
        name,
        price,
        duration,
        features,
        listingLimit,
        featuredListings,
        prioritySupport,
        analyticsAccess,
        isActive
      }
    });

    res.json(plan);
  } catch (error) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({ error: 'Failed to update subscription plan' });
  }
};

// Delete a subscription plan
export const deleteSubscriptionPlan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if any active subscriptions exist for this plan
    const activeSubscriptions = await prisma.userSubscription.count({
      where: { planId: String(id), isActive: true }
    });

    if (activeSubscriptions > 0) {
      // Soft delete by deactivating
      await prisma.subscriptionPlan.update({
        where: { id: String(id) },
        data: { isActive: false }
      });
      return res.json({ message: 'Plan deactivated (has active subscriptions)' });
    }

    await prisma.subscriptionPlan.delete({
      where: { id: String(id) }
    });

    res.json({ message: 'Subscription plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    res.status(500).json({ error: 'Failed to delete subscription plan' });
  }
};

export const selectSellerSubscriptionPlan = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { planId } = req.body as { planId?: string };
    if (!planId) {
      return res.status(400).json({ error: 'planId is required' });
    }

    const [user, nextPlan] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          subscription: { include: { plan: true } }
        }
      }),
      prisma.subscriptionPlan.findUnique({
        where: { id: planId }
      })
    ]);

    if (!user || user.role !== Role.SELLER) {
      return res.status(403).json({ error: 'Only sellers can change subscription plans' });
    }

    if (!nextPlan || !nextPlan.isActive) {
      return res.status(404).json({ error: 'Subscription plan not found or inactive' });
    }

    const now = new Date();
    const currentSub = user.subscription;
    const hasActiveCurrentPlan = Boolean(
      currentSub &&
      currentSub.isActive &&
      currentSub.endDate > now &&
      currentSub.plan
    );

    if (hasActiveCurrentPlan && currentSub!.planId === nextPlan.id) {
      return res.status(400).json({ error: 'You are already on this plan', code: 'CURRENT_PLAN' });
    }

    const currentPlanPrice = hasActiveCurrentPlan ? Number(currentSub!.plan.price) : 0;
    const nextPlanPrice = Number(nextPlan.price);

    if (hasActiveCurrentPlan && nextPlanPrice < currentPlanPrice) {
      return res.status(400).json({ error: 'Downgrades are not allowed', code: 'DOWNGRADE_NOT_ALLOWED' });
    }

    let proratedCredit = 0;
    if (hasActiveCurrentPlan && currentPlanPrice > 0 && nextPlanPrice > currentPlanPrice) {
      const totalMs = currentSub!.endDate.getTime() - currentSub!.startDate.getTime();
      const remainingMs = currentSub!.endDate.getTime() - now.getTime();
      if (totalMs > 0 && remainingMs > 0) {
        proratedCredit = (currentPlanPrice * remainingMs) / totalMs;
      }
    }

    const amountToCharge = Math.max(0, nextPlanPrice - proratedCredit);
    const walletBalance = Number(user.wallet?.balance || 0);
    if (amountToCharge > walletBalance) {
      return res.status(400).json({
        error: 'Insufficient wallet balance for this upgrade',
        code: 'INSUFFICIENT_WALLET_BALANCE',
        amountToCharge: Number(amountToCharge.toFixed(2)),
        walletBalance: Number(walletBalance.toFixed(2))
      });
    }

    const subscriptionStart = now;
    const subscriptionEnd = new Date(subscriptionStart.getTime() + nextPlan.duration * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      if (amountToCharge > 0) {
        await tx.wallet.update({
          where: { userId },
          data: { balance: { decrement: amountToCharge } }
        });

        await tx.transaction.create({
          data: {
            userId,
            type: TransactionType.PURCHASE,
            amount: amountToCharge,
            status: TransactionStatus.SUCCESS,
            reference: `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            description: `Subscription upgrade to ${nextPlan.name}`,
            metadata: JSON.stringify({
              type: 'subscription_upgrade',
              fromPlanId: currentSub?.planId || null,
              toPlanId: nextPlan.id,
              proratedCredit: Number(proratedCredit.toFixed(2)),
              chargedAmount: Number(amountToCharge.toFixed(2))
            })
          }
        });
      }

      await tx.userSubscription.upsert({
        where: { userId },
        create: {
          userId,
          planId: nextPlan.id,
          startDate: subscriptionStart,
          endDate: subscriptionEnd,
          isActive: true
        },
        update: {
          planId: nextPlan.id,
          startDate: subscriptionStart,
          endDate: subscriptionEnd,
          isActive: true
        }
      });
    });

    const updatedSubscription = await prisma.userSubscription.findUnique({
      where: { userId },
      include: { plan: true }
    });

    return res.json({
      message: hasActiveCurrentPlan ? `Subscription upgraded to ${nextPlan.name}` : `Subscription activated: ${nextPlan.name}`,
      subscription: updatedSubscription,
      proration: {
        applied: proratedCredit > 0,
        proratedCredit: Number(proratedCredit.toFixed(2)),
        chargedAmount: Number(amountToCharge.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Error selecting seller subscription plan:', error);
    return res.status(500).json({ error: 'Failed to change subscription plan' });
  }
};
