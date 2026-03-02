import { Router } from 'express';
import { getSellers, getSellerById, getSellerRevenue, updateSellerProfile } from '../controllers/seller.controller';
import { getActiveSubscriptionPlans } from '../controllers/subscription.controller';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Public/Seller routes
router.get('/subscription-plans', getActiveSubscriptionPlans);

router.get('/', getSellers);
router.put('/profile', authenticateToken, updateSellerProfile);
router.get('/:id', optionalAuthenticateToken, getSellerById);
router.get('/:id/revenue', getSellerRevenue);

export default router;
