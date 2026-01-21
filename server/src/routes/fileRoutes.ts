import { Router } from 'express';
import { uploadFile, createFolder, getFileTree, getFileContent, 
        renameNode, deleteNode, updateFileData,
        addRow, deleteRow, addColumn, deleteColumn } from '../controllers/fileController';
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
router.post('/upload', upload.array('files'), uploadFile);

/**
 * POST /folder
 * 创建文件夹接口
 * 接收 { name, parentId } 参数，在数据库中创建文件夹记录
 */
// http://localhost:3000/api/files/folder
router.post('/folder', createFolder);

/**
 * GET /tree
 * 获取文件树接口
 * 查询数据库中的所有文件节点并返回树形结构
 */
// http://localhost:3000/api/files/tree
router.get('/tree', getFileTree);

/**
 * GET /content/:id
 * 🚨【修改 2】新增：获取文件内容接口
 * 用于前端点击文件时，通过 ID 获取文件内容 (按需加载)
 */
// http://localhost:3000/api/files/content/65a1b2c3d4e5...
router.get('/content/:id', getFileContent);

/**
 * PUT /:id
 * 重命名文件或文件夹
 */
router.put('/:id', renameNode);

/**
 * DELETE /:id
 * 删除文件或文件夹
 */
router.delete('/:id', deleteNode);

/**
 * POST /:id/update
 * 🚨【修改 2】新增：更新文件数据接口
 * 对应前端: geoService.updateFileData
 * 逻辑: 根据 rowIndex 修改 GeoJSON 中的 properties 并写回硬盘
 */
// http://localhost:3000/api/files/65a1.../update
router.post('/:id/update', updateFileData);


// 1. 新增行
router.post('/:id/row', addRow);
// 2. 删除行 (通常用 DELETE 方法，传 body 需要注意客户端支持，或者用 POST 模拟)
// 为了方便，这里用 POST 携带 body
router.post('/:id/row/delete', deleteRow);

// 3. 新增列
router.post('/:id/column', addColumn);
// 4. 删除列
router.post('/:id/column/delete', deleteColumn);


// export default 的特权：在别的文件中引用的时候，可以随意起名
// (在index.ts里引用的时候起名为fileRoutes)
export default router;