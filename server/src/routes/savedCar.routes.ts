import { Router } from 'express';
import { toggleSavedCar, getSavedCars, checkIsSaved } from '../controllers/savedCar.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/toggle', authenticateToken, toggleSavedCar);
router.get('/', authenticateToken, getSavedCars);
router.get('/:carId/check', authenticateToken, checkIsSaved);

export default router;
