import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

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
