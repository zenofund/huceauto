import { Request, Response } from 'express';
import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client';
import { createNotification } from './notification.controller';
import { z } from 'zod';

const prisma = new PrismaClient();

const depositSchema = z.object({
  amount: z.number().positive(),
  description: z.string().optional(),
});

const withdrawalSchema = z.object({
  amount: z.number().positive(),
  description: z.string().optional(),
});

import { initializePayment, verifyPayment } from '../utils/paystack';

export const initializePaystackDeposit = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { amount, metadata } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const paystackData = await initializePayment(user.email, amount, metadata);

    // Create a pending transaction
    await prisma.transaction.create({
      data: {
        userId,
        amount,
        type: metadata?.type === 'purchase' ? TransactionType.PURCHASE : TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        reference: paystackData.data.reference,
        paystackRef: paystackData.data.reference,
        description: metadata?.type === 'purchase' ? `Payment for car purchase` : 'Paystack deposit',
        metadata: metadata ? JSON.stringify(metadata) : null
      },
    });

    res.json(paystackData);
  } catch (error) {
    console.error('Paystack init error:', error);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
};

export const verifyPaystackDeposit = async (req: Request, res: Response) => {
  try {
    const { reference } = req.query;
    if (!reference) return res.status(400).json({ error: 'Reference required' });

    const verificationData = await verifyPayment(reference as string);

    if (verificationData.data.status === 'success') {
      const transaction = await prisma.transaction.findUnique({
        where: { reference: reference as string },
      });

      if (!transaction) {
        return res.status(404).json({ 
          message: 'Transaction record not found', 
          status: 'error' 
        });
      }

      // If already successful, we still return success but with a specific message
      if (transaction.status === TransactionStatus.SUCCESS) {
        return res.json({ 
          message: 'This payment has already been verified and processed.', 
          status: 'success' 
        });
      }

      if (transaction.status === TransactionStatus.PENDING) {
        const metadata = transaction.metadata ? JSON.parse(transaction.metadata as string) : null;

        if (metadata?.type === 'purchase' && metadata?.offerId) {
          // Handle direct car purchase via Paystack
          const offer = await prisma.offer.findUnique({
            where: { id: metadata.offerId },
            include: { 
              car: true,
              buyer: {
                select: {
                  firstName: true,
                  lastName: true
                }
              }
            }
          });

          if (!offer) {
            return res.status(404).json({ error: 'Offer not found for purchase' });
          }

          await prisma.$transaction(async (tx) => {
            // Update transaction
            await tx.transaction.update({
              where: { id: transaction.id },
              data: { status: TransactionStatus.SUCCESS },
            });

            // Add to seller's wallet
            await tx.wallet.update({
              where: { userId: offer.sellerId },
              data: { balance: { increment: transaction.amount } },
            });

            // Create transaction for seller
            await tx.transaction.create({
              data: {
                userId: offer.sellerId,
                amount: transaction.amount,
                type: TransactionType.SALE,
                status: TransactionStatus.SUCCESS,
                reference: `SALE-PS-${metadata.offerId}-${Date.now()}`,
                description: `Sale of ${offer.car.title} via Paystack`,
              },
            });

            // Mark car as SOLD
            await tx.car.update({
              where: { id: offer.carId },
              data: { status: 'SOLD' },
            });

            // Update offer status
            await tx.offer.update({
              where: { id: offer.id },
              data: { status: 'COMPLETED' }
            });

            // Notify buyer and seller
            await createNotification(offer.buyerId, {
              title: 'Purchase Successful',
              message: `Your payment for ${offer.car.year} ${offer.car.make} ${offer.car.model} was successful.`,
              type: 'OFFER',
              link: '/buyer-dashboard?tab=purchases'
            });

            await createNotification(offer.sellerId, {
              title: 'Car Sold!',
              message: `Your ${offer.car.year} ${offer.car.make} ${offer.car.model} has been sold to ${offer.buyer.firstName} ${offer.buyer.lastName}.`,
              type: 'OFFER',
              link: '/seller-dashboard?tab=inventory'
            });

            // Reject other offers
            await tx.offer.updateMany({
              where: { 
                carId: offer.carId,
                id: { not: offer.id },
                status: { in: ['PENDING', 'ACCEPTED', 'COUNTERED'] }
              },
              data: { status: 'REJECTED' }
            });
          });

          return res.json({ message: 'Purchase verified successfully', status: 'success' });
        } else {
          // Normal wallet deposit
          await prisma.$transaction(async (tx) => {
            await tx.transaction.update({
              where: { id: transaction.id },
              data: { status: TransactionStatus.SUCCESS },
            });

            await tx.wallet.update({
              where: { userId: transaction.userId },
              data: { balance: { increment: transaction.amount } },
            });
          });
          return res.json({ message: 'Payment verified and wallet updated', status: 'success' });
        }
      }
    }

    // If we reach here, either status wasn't 'success' or some other condition failed
    // Ensure we NEVER return 'success' status if the payment wasn't actually successful
    const failureMessage = verificationData.data.gateway_response || 'Payment not successful';
    const failureStatus = verificationData.data.status || 'failed';
    
    res.json({ 
      message: failureMessage, 
      status: failureStatus === 'success' ? 'error' : failureStatus 
    });
  } catch (error) {
    console.error('Paystack verify error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

export const getWallet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    // If wallet doesn't exist (for older users), create it
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
          currency: 'NGN',
        },
      });
    }

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Calculate revenue stats for sellers
    let revenueStats = {
      totalEarned: 0,
      pendingEarned: 0
    };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === 'SELLER') {
      const allSellerTransactions = await prisma.transaction.findMany({
        where: { 
          userId,
          type: TransactionType.SALE
        },
        select: {
          amount: true,
          status: true
        }
      });

      revenueStats.totalEarned = allSellerTransactions
        .filter(t => t.status === TransactionStatus.SUCCESS)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      revenueStats.pendingEarned = allSellerTransactions
        .filter(t => t.status === TransactionStatus.PENDING)
        .reduce((sum, t) => sum + Number(t.amount), 0);
    }

    res.json({
      wallet,
      transactions,
      revenueStats
    });
  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({ error: 'Failed to fetch wallet information' });
  }
};

export const purchaseCar = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { offerId } = req.body;

    if (!offerId) {
      return res.status(400).json({ error: 'Offer ID is required' });
    }

    // 1. Get offer and car details
    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        car: true,
      },
    });

    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    if (offer.buyerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to pay for this offer' });
    }

    if (offer.status !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Offer must be accepted before payment' });
    }

    const amount = offer.amount;

    // 2. Check buyer's wallet
    const buyerWallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!buyerWallet || buyerWallet.balance.lessThan(amount)) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    // 3. Execute purchase in a transaction
    await prisma.$transaction(async (tx) => {
      // Deduct from buyer
      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

      // Add to seller
      await tx.wallet.update({
        where: { userId: offer.sellerId },
        data: { balance: { increment: amount } },
      });

      // Create transaction for buyer
      await tx.transaction.create({
        data: {
          userId,
          amount,
          type: TransactionType.PURCHASE,
          status: TransactionStatus.SUCCESS,
          reference: `PURCH-${offerId}-${Date.now()}`,
          description: `Purchase of ${offer.car.title}`,
        },
      });

      // Create transaction for seller
      await tx.transaction.create({
        data: {
          userId: offer.sellerId,
          amount,
          type: TransactionType.SALE,
          status: TransactionStatus.SUCCESS,
          reference: `SALE-${offerId}-${Date.now()}`,
          description: `Sale of ${offer.car.title}`,
        },
      });

      // Mark car as SOLD
      await tx.car.update({
        where: { id: offer.carId },
        data: { status: 'SOLD' },
      });

      // Update offer status to COMPLETED
      await tx.offer.update({
        where: { id: offerId },
        data: { status: 'COMPLETED' }
      });

      // Reject all other offers for this car
      await tx.offer.updateMany({
        where: { 
          carId: offer.carId,
          id: { not: offerId },
          status: { in: ['PENDING', 'ACCEPTED', 'COUNTERED'] }
        },
        data: { status: 'REJECTED' }
      });
    });

    res.json({ message: 'Purchase successful', status: 'success' });
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ error: 'Failed to process purchase' });
  }
};

export const depositRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { amount, description } = depositSchema.parse(req.body);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Create a pending transaction for manual deposit
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        amount,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        description: description || 'Manual deposit request',
        reference: `DEP-${Date.now()}`,
      },
    });

    res.status(201).json({
      message: 'Deposit request submitted successfully. Please wait for admin approval.',
      transaction,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error('Deposit request error:', error);
    res.status(500).json({ error: 'Failed to submit deposit request' });
  }
};

export const withdrawalRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { amount, description } = withdrawalSchema.parse(req.body);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet || Number(wallet.balance) < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct balance immediately for withdrawal request? 
    // Usually it's better to keep it and mark as "locked" or just check upon approval.
    // For simplicity, we'll deduct upon approval, but check here if they have enough.

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        amount,
        type: TransactionType.WITHDRAWAL,
        status: TransactionStatus.PENDING,
        description: description || 'Manual withdrawal request',
        reference: `WTH-${Date.now()}`,
      },
    });

    res.status(201).json({
      message: 'Withdrawal request submitted successfully. Please wait for admin approval.',
      transaction,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    console.error('Withdrawal request error:', error);
    res.status(500).json({ error: 'Failed to submit withdrawal request' });
  }
};

// Admin functions to approve/reject (would normally be in an admin controller)
export const approveTransaction = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    
    if (typeof transactionId !== 'string') {
      return res.status(400).json({ error: 'Invalid transaction ID' });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction || transaction.status !== TransactionStatus.PENDING) {
      return res.status(400).json({ error: 'Invalid transaction' });
    }

    // Use transaction to ensure data integrity
    await prisma.$transaction(async (tx) => {
      // Update transaction status
      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: TransactionStatus.SUCCESS },
      });

      // Update wallet balance
      if (transaction.type === TransactionType.DEPOSIT) {
        await tx.wallet.update({
          where: { userId: transaction.userId },
          data: { balance: { increment: transaction.amount } },
        });
      } else if (transaction.type === TransactionType.WITHDRAWAL) {
        await tx.wallet.update({
          where: { userId: transaction.userId },
          data: { balance: { decrement: transaction.amount } },
        });
      }
    });

    res.json({ message: 'Transaction approved successfully' });
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ error: 'Failed to approve transaction' });
  }
};

export const getPendingTransactions = async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { status: TransactionStatus.PENDING },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(transactions);
  } catch (error) {
    console.error('Fetch pending error:', error);
    res.status(500).json({ error: 'Failed to fetch pending transactions' });
  }
};
