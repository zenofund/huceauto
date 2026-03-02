import { Router } from 'express';
import { getCars, getCarById, createCar, updateCar, requestDeletion } from '../controllers/car.controller';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Public routes (with optional auth for isFavorited status)
router.get('/', optionalAuthenticateToken, getCars);
router.get('/:id', optionalAuthenticateToken, getCarById);

// Protected routes
router.post('/', authenticateToken, upload.array('images', 10), createCar);
router.put('/:id', authenticateToken, upload.array('images', 10), updateCar);
router.post('/:id/request-deletion', authenticateToken, requestDeletion);

export default router;
