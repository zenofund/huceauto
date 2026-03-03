import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';
import bcrypt from 'bcryptjs';
import { getBanks, resolveAccountNumber } from '../utils/paystack';

const router = Router();
const prisma = new PrismaClient();

// Get current user profile
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        avatar: true,
        verified: true,
        sellerProfile: true,
        buyerProfile: true,
        inspectorProfile: true,
        subscription: {
          include: {
            plan: true
          }
        },
        wallet: {
          select: {
            balance: true,
            currency: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Get list of Nigerian banks
router.get('/banks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const banks = await getBanks();
    res.json(banks);
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// Resolve account number
router.get('/resolve-account', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { accountNumber, bankCode } = req.query;
    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'Account number and bank code are required' });
    }
    const result = await resolveAccountNumber(accountNumber as string, bankCode as string);
    res.json(result);
  } catch (error) {
    console.error('Error resolving account:', error);
    res.status(500).json({ error: 'Failed to resolve account' });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid current password' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Update payment info
router.put('/payment-info', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { bankName, accountNumber, accountName, autopay } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        buyerProfile: true,
        sellerProfile: true,
        inspectorProfile: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profile;
    if (user.role === 'SELLER') {
      profile = await prisma.sellerProfile.update({
        where: { userId },
        data: { bankName, accountNumber, accountName, autopay }
      });
    } else if (user.role === 'INSPECTOR') {
      profile = await prisma.inspectorProfile.update({
        where: { userId },
        data: { bankName, accountNumber, accountName, autopay }
      });
    } else {
      // For BUYER role, save to BuyerProfile
      profile = await prisma.buyerProfile.upsert({
        where: { userId },
        create: { userId, bankName, accountNumber, accountName, autopay },
        update: { bankName, accountNumber, accountName, autopay }
      });
    }
    
    res.json({ 
      message: 'Payment information updated successfully',
      buyerProfile: user.role === 'BUYER' ? profile : undefined,
      sellerProfile: user.role === 'SELLER' ? profile : undefined,
      inspectorProfile: user.role === 'INSPECTOR' ? profile : undefined
    });
  } catch (error) {
    console.error('Error updating payment info:', error);
    res.status(500).json({ error: 'Failed to update payment information' });
  }
});

// Update avatar
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarUrl = req.file.path;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        avatar: true,
      },
    });

    res.json({ message: 'Avatar updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating avatar:', error);
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// Update user profile
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, officeName } = req.body;

    // Verify user is updating their own profile
    if (req.user?.userId !== id) {
      return res.status(403).json({ error: 'Unauthorized to update this profile' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true }
    });

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        firstName,
        lastName,
        phone,
        ...(user?.role === 'INSPECTOR' && officeName !== undefined ? {
          inspectorProfile: {
            upsert: {
              create: { officeName },
              update: { officeName }
            }
          }
        } : {})
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        avatar: true,
        inspectorProfile: true,
        sellerProfile: true,
        buyerProfile: true,
      },
    });

    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
