import { Router } from 'express';
import { getMessages, sendMessage, markAsRead, getUnreadCount } from '../controllers/message.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticateToken, getMessages);
router.post('/', authenticateToken, sendMessage);
router.get('/unread/count', authenticateToken, getUnreadCount);
router.patch('/:id/read', authenticateToken, markAsRead);

export default router;
