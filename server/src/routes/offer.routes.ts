import { Router } from 'express';
import { getOffersByCarId, createOffer, rejectOffer, cancelOffer, counterOffer, acceptOffer, getSellerOffers } from '../controllers/offer.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/seller', authenticateToken, getSellerOffers);
router.get('/car/:carId', authenticateToken, getOffersByCarId);
router.post('/', authenticateToken, createOffer);
router.post('/:id/accept', authenticateToken, acceptOffer);
router.post('/:id/reject', authenticateToken, rejectOffer);
router.post('/:id/cancel', authenticateToken, cancelOffer);
router.post('/:id/counter', authenticateToken, counterOffer);

export default router;
