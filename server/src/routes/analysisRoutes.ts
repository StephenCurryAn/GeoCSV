import { Router } from 'express';
import { pivotAnalysis, generateGrid, exportGrid, getRegisteredModels, registerModelByAI, executeTableFormula, createModelViaNaturalLanguage } from '../controllers/analysisController';
// 容器化模型相关控制器
import { uploadAndBuildContainerModel } from '../controllers/containerModelController';
import { executeContainerModel } from '../controllers/modelExecutionController';
import upload from '../utils/uploadConfig';

const router = Router();

// POST /api/analysis/pivot
router.post('/pivot', pivotAnalysis);

// ✅ [新增] 空间网格聚合接口
router.post('/grid', generateGrid);

// ✅ [新增] 导出接口
router.post('/export-grid', exportGrid);

// ✅ [新增] 查询可用模型接口
router.get('/models', getRegisteredModels);

// 🌟 新增：注册 AI 代理写入路由
router.post('/register-ai', registerModelByAI);

// 🌟 新增：注册前端公式执行路由
router.post('/execute-formula', executeTableFormula);

// 🌟 新增：通过自然语言创建模型路由
router.post('/agent/generate-model', createModelViaNaturalLanguage);

// 容器化模型上传与构建路由
router.post('/container-models/upload', upload.single('modelZip'), uploadAndBuildContainerModel);
router.post('/container-models/execute', executeContainerModel);

export default router;