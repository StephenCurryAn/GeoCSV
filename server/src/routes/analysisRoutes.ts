import { Router } from 'express';
import { pivotAnalysis } from '../controllers/analysisController';

const router = Router();

// POST /api/analysis/pivot
router.post('/pivot', pivotAnalysis);

export default router;