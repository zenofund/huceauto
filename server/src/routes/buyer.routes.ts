import { Router } from 'express';
import { getBuyerStats, getBuyerActivities } from '../controllers/buyer.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/:id/stats', authenticateToken, getBuyerStats);
router.get('/:id/activities', authenticateToken, getBuyerActivities);

export default router;
