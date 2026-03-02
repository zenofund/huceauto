import { Router } from 'express';
import { recordView, getViewHistory, clearHistory, deleteHistoryItem } from '../controllers/viewHistory.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/record', authenticateToken, recordView);
router.get('/', authenticateToken, getViewHistory);
router.delete('/clear', authenticateToken, clearHistory);
router.delete('/:carId', authenticateToken, deleteHistoryItem);

export default router;
