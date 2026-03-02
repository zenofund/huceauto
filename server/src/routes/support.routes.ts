import { Router } from 'express';
import { 
  createTicket, 
  getTickets, 
  getTicketDetails, 
  sendSupportMessage, 
  updateTicketStatus 
} from '../controllers/support.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Customer support routes
router.post('/tickets', authenticateToken, createTicket);
router.get('/tickets', authenticateToken, getTickets);
router.get('/tickets/:id', authenticateToken, getTicketDetails);
router.post('/tickets/:id/messages', authenticateToken, sendSupportMessage);
router.patch('/tickets/:id/status', authenticateToken, updateTicketStatus);

export default router;
