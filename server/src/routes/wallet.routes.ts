import { Router } from 'express';
import { getWallet, depositRequest, withdrawalRequest, approveTransaction, purchaseCar, getPendingTransactions, initializePaystackDeposit, verifyPaystackDeposit } from '../controllers/wallet.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All wallet routes are protected
router.get('/', authenticateToken, getWallet);
router.post('/deposit', authenticateToken, depositRequest);
router.post('/withdrawal', authenticateToken, withdrawalRequest);
router.post('/purchase', authenticateToken, purchaseCar);

// Paystack routes
router.post('/paystack/initialize', authenticateToken, initializePaystackDeposit);
router.get('/paystack/verify', authenticateToken, verifyPaystackDeposit);

export default router;
