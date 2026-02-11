import { Router } from 'express';
import { pivotAnalysis,generateGrid } from '../controllers/analysisController';

const router = Router();

// POST /api/analysis/pivot
router.post('/pivot', pivotAnalysis);

// ✅ [新增] 空间网格聚合接口
router.post('/grid', generateGrid);

export default router;