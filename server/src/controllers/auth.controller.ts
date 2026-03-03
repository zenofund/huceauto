import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { PrismaClient, Role, SellerType, VerificationPurpose, UserStatus } from '@prisma/client';
import { z, ZodError } from 'zod';
import { sendEmail, sendOTP } from '../utils/notifications';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET is not defined in environment variables');
}

// Ensure JWT_SECRET is a string for TypeScript
const secret: jwt.Secret = JWT_SECRET;

// Utility to generate 4-digit code
const generateVerificationCode = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Validation Schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  role: z.enum(['BUYER', 'SELLER', 'INSPECTOR', 'ADMIN']).optional(),
  phone: z.string().optional(),
  sellerProfile: z.object({
    carLotName: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        email: validatedData.email,
        password: hashedPassword,
        phone: validatedData.phone,
        role: (validatedData.role as Role) || Role.BUYER,
        status: validatedData.role === 'SELLER' ? UserStatus.PENDING : UserStatus.ACTIVE,
        verified: false, // Explicitly set to false until verified
        // Create wallet for every user
        wallet: {
          create: {
            balance: 0,
            currency: 'NGN',
          },
        },
        // If seller, create seller profile
        ...(validatedData.role === 'SELLER' && {
          sellerProfile: {
            create: {
              // If carLotName is provided, treat as COMPANY, otherwise INDIVIDUAL
              type: (validatedData.sellerProfile?.carLotName?.trim()) 
                ? SellerType.COMPANY 
                : SellerType.INDIVIDUAL,
              companyName: validatedData.sellerProfile?.carLotName?.trim() || null,
              address: validatedData.sellerProfile?.address || '',
              verified: false,
            },
          },
        }),
        // If buyer (default), create buyer profile
        ...((!validatedData.role || validatedData.role === 'BUYER') && {
          buyerProfile: {
            create: {},
          },
        }),
      },
    });

    // Generate and send verification code
    const verificationCode = generateVerificationCode();
    // Using a lower rounds count for faster hashing (10 is default, 8 is still very secure for short-lived codes)
    const codeHash = await bcrypt.hash(verificationCode, 8);
    
    await prisma.verificationCode.create({
      data: {
        userId: user.id,
        codeHash,
        purpose: VerificationPurpose.SIGNUP,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // Don't await the email sending to speed up the response
    sendOTP(user.email, verificationCode, 'signup');

    res.status(201).json({
      message: 'Registration successful. Please verify your email.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error: any) {
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
      include: {
        buyerProfile: true,
        sellerProfile: true,
        inspectorProfile: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(validatedData.password, user.password);

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if user is verified
    if (!user.verified) {
      res.status(403).json({ 
        error: 'Please verify your email to login',
        unverified: true,
        email: user.email 
      });
      return;
    }

    if (user.status !== UserStatus.ACTIVE) {
      const isPending = user.status === UserStatus.PENDING;
      res.status(403).json({
        error: isPending ? 'Your account is pending admin approval' : 'Your account has been deactivated',
        status: user.status
      });
      return;
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role } as any,
      secret,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        buyerProfile: user.buyerProfile,
        sellerProfile: user.sellerProfile,
        inspectorProfile: user.inspectorProfile,
      },
    });
  } catch (error: any) {
    console.error('Login error in controller:', error);
    if (error instanceof ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      res.status(400).json({ error: 'Email and verification code are required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.verified) {
      res.status(400).json({ error: 'Email is already verified' });
      return;
    }

    const verificationRecord = await prisma.verificationCode.findFirst({
      where: {
        userId: user.id,
        purpose: VerificationPurpose.SIGNUP,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verificationRecord) {
      res.status(400).json({ error: 'Verification code expired or not found' });
      return;
    }

    const isValidCode = await bcrypt.compare(code, verificationRecord.codeHash);

    if (!isValidCode) {
      res.status(400).json({ error: 'Invalid verification code' });
      return;
    }

    // Mark as verified and code as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { verified: true },
      }),
      prisma.verificationCode.update({
        where: { id: verificationRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Generate token for immediate login after verification
    const token = jwt.sign(
      { userId: user.id, role: user.role } as any,
      secret,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Email verified successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resendVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.verified) {
      res.status(400).json({ error: 'Email is already verified' });
      return;
    }

    // Generate new code
    const verificationCode = generateVerificationCode();
    // Using a lower rounds count for faster hashing (10 is default, 8 is still very secure for short-lived codes)
    const codeHash = await bcrypt.hash(verificationCode, 8);

    await prisma.verificationCode.create({
      data: {
        userId: user.id,
        codeHash,
        purpose: VerificationPurpose.SIGNUP,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    // Don't await the email sending to speed up the response
    sendOTP(user.email, verificationCode, 'signup');

    res.json({ message: 'New verification code sent to your email' });
  } catch (error: any) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // For security, don't reveal if user exists or not
      res.json({ message: 'If an account exists with this email, a reset code has been sent.' });
      return;
    }

    // Generate code
    const verificationCode = generateVerificationCode();
    const codeHash = await bcrypt.hash(verificationCode, 8);

    await prisma.verificationCode.create({
      data: {
        userId: user.id,
        codeHash,
        purpose: VerificationPurpose.FORGOT_PASSWORD,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      },
    });

    sendOTP(user.email, verificationCode, 'forgot-password');

    res.json({ message: 'If an account exists with this email, a reset code has been sent.' });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      res.status(400).json({ error: 'Email, code, and new password are required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const verificationRecord = await prisma.verificationCode.findFirst({
      where: {
        userId: user.id,
        purpose: VerificationPurpose.FORGOT_PASSWORD,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verificationRecord) {
      res.status(400).json({ error: 'Invalid or expired reset code' });
      return;
    }

    const isValidCode = await bcrypt.compare(code, verificationRecord.codeHash);

    if (!isValidCode) {
      res.status(400).json({ error: 'Invalid reset code' });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and mark code as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      prisma.verificationCode.update({
        where: { id: verificationRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    res.json({ message: 'Password reset successful' });
  } catch (error: any) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
