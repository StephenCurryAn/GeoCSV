import { Router } from 'express';
import { uploadFile } from '../controllers/fileController';
import upload from '../utils/uploadConfig';

/**
 * 文件路由模块
 * 定义与文件上传相关的 API 接口
 */
const router = Router();

/**
 * POST /upload
 * 文件上传接口
 * 使用 upload.single('file') 中间件处理单个文件上传
 * 然后调用 uploadFile 控制器处理业务逻辑
 */
router.post('/upload', upload.single('file'), uploadFile);

export default router;