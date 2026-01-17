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
// 这里面的'file'，是前端 form-data 里那个字段的名字
// single 方法表示只处理单个文件上传
// http://localhost:3000/api/files/upload
router.post('/upload', upload.single('file'), uploadFile);

// export default 的特权：在别的文件中引用的时候，可以随意起名
// (在index.ts里引用的时候起名为fileRoutes)
export default router;