import { Router } from 'express';
import { 
  createInspectionRequest, 
  getInspectionsByCarId,
  getInspectorInspections,
  assignInspector,
  submitInspectionReport,
  getAvailableInspections,
  getInspectorStats,
  uploadInspectionPhotos
} from '../controllers/inspection.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.post('/', authenticateToken, createInspectionRequest);
router.get('/car/:carId', authenticateToken, getInspectionsByCarId);
router.get('/inspector', authenticateToken, getInspectorInspections);
router.get('/stats', authenticateToken, getInspectorStats);
router.get('/available', authenticateToken, getAvailableInspections);
router.post('/:inspectionId/assign', authenticateToken, assignInspector);
router.post('/:inspectionId/report', authenticateToken, submitInspectionReport);
router.post('/upload-photos', authenticateToken, upload.array('photos', 10), uploadInspectionPhotos);

export default router;
