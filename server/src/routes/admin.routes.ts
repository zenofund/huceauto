import { Router } from 'express';
import { authenticateToken, isAdmin } from '../middleware/auth.middleware';
import * as adminController from '../controllers/admin.controller';
import * as walletController from '../controllers/wallet.controller';

const router = Router();

// Apply authentication and admin check to all admin routes
router.use(authenticateToken);
router.use(isAdmin);

// Dashboard stats
router.get('/stats', adminController.getAdminStats);

// User management
router.get('/users', adminController.getAdminUsers);
router.get('/users/:id', adminController.getAdminUserDetails);
router.patch('/users/:id/status', adminController.updateUserStatus);
router.patch('/users/:id', adminController.updateUser);
router.post('/users', adminController.createAdminUser);
router.post('/users/:id/message', adminController.sendUserMessage);

// Wallet management
router.get('/wallet/pending', walletController.getPendingTransactions);
router.post('/wallet/approve/:transactionId', walletController.approveTransaction);

// System configuration
router.get('/config', adminController.getSystemConfig);
router.post('/config', adminController.updateSystemConfig);
router.post('/config/test-smtp', adminController.testSMTPDeliverability);

export default router;
