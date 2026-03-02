import { Router } from 'express';
import { getSellers, getSellerById, getSellerRevenue, updateSellerProfile } from '../controllers/seller.controller';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/', getSellers);
router.put('/profile', authenticateToken, updateSellerProfile);
router.get('/:id', optionalAuthenticateToken, getSellerById);
router.get('/:id/revenue', getSellerRevenue);

export default router;
