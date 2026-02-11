import { Router } from 'express';
import { pivotAnalysis, generateGrid, exportGrid } from '../controllers/analysisController';

const router = Router();

// POST /api/analysis/pivot
router.post('/pivot', pivotAnalysis);

// ✅ [新增] 空间网格聚合接口
router.post('/grid', generateGrid);

// ✅ [新增] 导出接口
router.post('/export-grid', exportGrid);

export default router;