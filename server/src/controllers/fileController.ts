import { Request, Response } from 'express';
import fs from 'fs';
// import { promises as fsPromises } from 'fs'; // 🚨【修改】更稳妥的导入方式，给 updateFileData 用
import path from 'path';
// 因为 Multer 存硬盘的代码和控制器处理数据的代码，                                                                                                                        │
// 不在同一个文件里面，所以不好将路径这个参数传递，只好通过 req 的方式，所以需要req                                                                                        │
// Multer存到硬盘之后，但是控制器还不知道这个文件路径是什么，所以需要req                                                                                                   │
// 先进行Multer存硬盘这个步骤，然后进行控制器处理数据这个步骤，并返回回复
import FileNode from '../models/FileNode'; // 导入文件节点模型
import vm from 'vm'; // 🚨 引入 Node.js 虚拟机模块，用于动态执行代码

// ==========================================
// 1. 全局环境补丁 (模拟浏览器环境)
// ==========================================
const g = global as any;
if (!g.self) g.self = g;
if (!g.window) g.window = g; // 有些库也会检查 window
if (!g.document) g.document = {}; // 防止访问 document 报错

// 🚨【修改】使用这种方式获取 promises，兼容性最好，防止 undefined 报错
const fsPromises = fs.promises;

/**
 * 将 Node.js Buffer 转换为 ArrayBuffer
 */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}

/**
 * 🚨【黑科技】手动加载 shpjs 库
 * 绕过 package.json "exports" 限制，直接读取源码并执行
 */
async function loadShpLibrary() {
    // 1. 尝试找到库文件的物理路径
    const possiblePaths = [
        path.join(process.cwd(), 'node_modules/shpjs/dist/shp.js'),
        path.join(__dirname, '../../node_modules/shpjs/dist/shp.js'),
        path.join(__dirname, '../node_modules/shpjs/dist/shp.js') // 容错
    ];

    let libPath = '';
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            libPath = p;
            break;
        }
    }

    if (!libPath) {
        throw new Error('无法在 node_modules 中找到 shpjs/dist/shp.js，请确认已 npm install shpjs');
    }

    console.log(`🔨 [Loader] 手动编译库文件: ${libPath}`);

    // 2. 读取源码
    const code = await fsPromises.readFile(libPath, 'utf-8');

    // 3. 构造一个模拟的 CommonJS 环境
    const sandbox = {
        module: { exports: {} },
        exports: {},
        global: g,
        self: g,
        window: g,
        ArrayBuffer: ArrayBuffer,
        DataView: DataView,
        Uint8Array: Uint8Array,
        parseFloat: parseFloat,
        parseInt: parseInt,
        console: console,
        setTimeout: setTimeout,
        TextDecoder: TextDecoder // 解析 DBF 需要
    };
    
    // 确保 module.exports 引用正确
    sandbox.exports = sandbox.module.exports;

    // 4. 在沙箱中执行代码
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    // 5. 获取导出结果
    const shp = sandbox.module.exports as any;

    if (!shp || typeof shp.parseShp !== 'function') {
        throw new Error('手动编译成功，但未检测到 parseShp 方法');
    }

    return shp;
}

/**
 * 🚨【修改】读取并解析文件
 * 增加了 dbExtension 参数，优先使用数据库存的后缀，防止物理文件名被改乱（如 .json_12345）导致识别失败
 */
const readAndParseFile = async (filePath: string, dbExtension?: string) => {
    // 1. 检查物理文件是否存在
    try {
        await fsPromises.access(filePath);
    } catch {
        throw new Error(`物理文件丢失，路径: ${filePath}`);
    }

    // 🚨 核心修复：优先用数据库里的后缀 (比如 .json)，如果没有才去解析路径
    let ext = dbExtension || path.extname(filePath);
    ext = ext.toLowerCase();

    console.log(`[FileController] 正在读取: ${path.basename(filePath)} | 识别后缀: ${ext}`);
    
    // 🚨 Shapefile 专用逻辑
    if (ext === '.shp') {
        console.log('🔄 [Parser] 开始解析 Shapefile:', path.basename(filePath));
        
        try {
            // A. 加载库
            const shp = await loadShpLibrary();

            // B. 读取文件并转换格式
            const shpNodeBuffer = await fsPromises.readFile(filePath);
            const shpArrayBuffer = toArrayBuffer(shpNodeBuffer); // 关键！
            
            const dbfPath = filePath.replace(/\.shp$/i, '.dbf');
            const prjPath = filePath.replace(/\.shp$/i, '.prj'); 

            let dbfArrayBuffer;
            try {
                const dbfNodeBuffer = await fsPromises.readFile(dbfPath);
                dbfArrayBuffer = toArrayBuffer(dbfNodeBuffer); // 关键！
            } catch (e) {
                throw new Error('缺少同名的 .dbf 文件');
            }

            let prjString;
            try {
                prjString = await fsPromises.readFile(prjPath, 'utf-8');
            } catch (e) { /* 忽略 */ }

            // C. 解析
            const geojson = shp.combine([
                shp.parseShp(shpArrayBuffer, prjString), 
                shp.parseDbf(dbfArrayBuffer)
            ]);
            
            console.log('✅ [Parser] Shapefile 解析成功!');
            return { type: 'json', data: geojson };

        } catch (e: any) {
            console.error('❌ [Parser] 错误:', e);
            throw new Error(`Shapefile 解析失败: ${e.message}`);
        }
    }

    const content = await fsPromises.readFile(filePath, 'utf-8');
    
    if (ext === '.json' || ext === '.geojson') {
        try {
            return { type: 'json', data: JSON.parse(content) };
        } catch (e) {
            throw new Error('JSON 文件内容格式错误，解析失败');
        }
    } else if (ext === '.csv') {
        return { type: 'csv', data: content }; 
    } else if (ext === '.shp') {
        return { type: 'shp', data: null };
    }
    
    // 默认当做文本返回
    return { type: 'text', data: content };
};

/**
 * 保存文件
 */
const saveFile = async (filePath: string, type: string, data: any) => {
    if (type === 'json') {
        await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } else {
        if (typeof data === 'string') {
            await fsPromises.writeFile(filePath, data, 'utf-8');
        }
    }
};


/**
 * 将扁平数组转换为树形结构的辅助函数
 * @param nodes 扁平的文件节点数组
 * @returns 树形结构的文件节点数组
 */
function buildTreeFromFlatArray(nodes: any[]) {
    // 创建一个映射，便于快速查找节点
    const nodeMap: { [key: string]: any } = {};
    const tree: any[] = [];

    // 首先创建所有节点的映射
    nodes.forEach(node => {
        nodeMap[node._id.toString()] = { ...node._doc }; // 使用 _doc 获取实际数据
    });

    // 然后建立父子关系
    nodes.forEach(node => {
        const currentNode = nodeMap[node._id.toString()];

        // 设置 Ant Design Tree 需要的字段
        currentNode.key = node._id.toString();
        currentNode.title = node.name;
        currentNode.isLeaf = node.type === 'file';

        // 如果是根节点（parentId 为 null），直接添加到树的顶层
        if (!node.parentId) {
            tree.push(currentNode);
        } else {
            // 如果不是根节点，找到其父节点并添加到父节点的 children 数组中
            const parentNode = nodeMap[node.parentId.toString()];
            if (parentNode) {
                if (!parentNode.children) {
                    parentNode.children = [];
                }
                parentNode.children.push(currentNode);
            }
        }
    });

    return tree;
}

/**
 * 文件上传控制器
 * 处理客户端上传的文件并将其解析为 GeoJSON 对象
 */
export const uploadFile = async (req: Request, res: Response) => {
    try {
        // 🚨【关键修改】获取 parentId
        // Multer 处理 FormData 时，文本字段会在 req.body 中
        // 前端传过来的可能是字符串 'null' 或 'undefined'，需要清洗
        let parentId = req.body.parentId;
        if (parentId === 'null' || parentId === 'undefined' || parentId === '') {
            parentId = null;
        }

        // 🚨 req.files 是一个数组 (因为我们用了 upload.array)
        const files = req.files as Express.Multer.File[];

        // 检查是否有文件被上传
        if (!files || files.length === 0) {
            return res.status(400).json({
                code: 400,
                message: '没有文件被上传',
                data: null
            });
        }
        // 🚨 为了防止文件名冲突（因为我们去掉了随机数），我们在这里统一给这一批文件重命名
        // 生成一个统一的时间戳ID
        const batchId = `${Date.now()}-${Math.round(Math.random() * 1000)}`;
        // 存储处理结果
        const processedFiles = [];
        // 1. 先进行一次遍历，把所有文件重命名为 "原文件名_BatchId.后缀"
        // 这样可以确保 .shp, .dbf, .shx 依然拥有相同的“前缀”，同时又全球唯一
        const renamedFilesMap: Record<string, string> = {}; // 用于记录 .shp 文件的最终路径
        
        for (const file of files) {
            // 修复乱码
            const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            const ext = path.extname(originalName).toLowerCase();
            const basename = path.basename(originalName, ext); // 不带后缀的文件名

            // 新文件名: 比如 "MyMap_1768821.shp"
            const newFilename = `${basename}_${batchId}${ext}`;
            const newPath = path.join(path.dirname(file.path), newFilename);

            // 重命名物理文件
            await fsPromises.rename(file.path, newPath);

            // 如果是 .shp 文件，我们把它作为“主文件”记录下来
            if (ext === '.shp') {
                renamedFilesMap['main'] = newPath;
                renamedFilesMap['originalName'] = originalName;
                renamedFilesMap['size'] = file.size.toString();
                renamedFilesMap['mime'] = file.mimetype;
            }
            // 如果是单文件 (json/csv)，也记录
            else if (['.json', '.geojson', '.csv'].includes(ext)) {
                renamedFilesMap['main'] = newPath;
                renamedFilesMap['originalName'] = originalName;
                renamedFilesMap['size'] = file.size.toString();
                renamedFilesMap['mime'] = file.mimetype;
            }
        }

        // 2. 存库逻辑
        // 我们只在数据库里存 "主文件" (.shp 或 .json) 的记录
        // 附属文件 (.dbf, .shx) 只要物理存在于硬盘即可，不需要数据库记录
        if (!renamedFilesMap['main']) {
            // 如果上传了一堆文件但没有 .shp 也没有 .json，说明不完整或不支持
            // (比如只传了 .dbf)
            return res.status(400).json({ code: 400, message: '上传不完整：Shapefile 必须包含 .shp 文件' });
        }
        const mainFilePath = renamedFilesMap['main'];
        const mainOriginalName = renamedFilesMap['originalName'];
        const mainExt = path.extname(mainFilePath).toLowerCase();

        // // 🚨【关键修复】解决中文文件名乱码问题
        // // 原理：Multer 用 latin1 读取了 utf8 的字符，我们把它逆转回去
        // req.file.originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        // // 获取上传文件的完整路径
        // const filePath = req.file.path;
        // // 检查文件是否存在
        // if (!fs.existsSync(filePath)) {
        //     return res.status(404).json({
        //         code: 404,
        //         message: '上传的文件未找到',
        //         data: null
        //     });
        // }
        // // 根据文件扩展名决定如何处理文件内容
        // const fileExtension = path.extname(req.file.originalname).toLowerCase();
        
        // 3. 解析预览
        let parsedData: any = null;
        try {
            // 如果是 .shp，readAndParseFile 内部会自动去找同名的 .dbf
            const result = await readAndParseFile(mainFilePath, mainExt);
            if (result.type === 'json') {
                parsedData = result.data;
            }
        } catch (e: any) {
            console.warn('预览解析警告:', e.message);
            // 如果是 shp 解析失败，可能是缺了 dbf，这里可以选择报错，或者仅存文件不预览
            if (mainExt === '.shp') {
                return res.status(400).json({ code: 400, message: `Shapefile 解析失败: ${e.message}` });
            }
        }

        // // 读取文件内容
        // const fileContent = fs.readFileSync(filePath, 'utf8');

        // // 根据文件类型进行不同的解析处理
        // if (fileExtension === '.csv') {
        //     // 如果是 CSV 文件，需要先转换为 JSON 再进一步处理为 GeoJSON
        //     // 这里暂时返回原始内容，实际应用中需要 CSV 到 GeoJSON 的转换逻辑
        //     parsedData = {
        //         type: 'FeatureCollection',
        //         features: []
        //     };
        //     console.warn('CSV to GeoJSON conversion not implemented yet.');
        // } else if (fileExtension === '.shp') {
        //     // Shapefile 需要特殊处理，通常需要额外的库如 shapefile-js
        //     // 这里暂时返回空的 FeatureCollection
        //     parsedData = {
        //         type: 'FeatureCollection',
        //         features: []
        //     };
        //     console.warn('Shapefile processing not implemented yet.');
        // } else {
        //     // 🚨【优化】使用异步读取
        //     const content = await fsPromises.readFile(filePath, 'utf-8');
        //     // 对于 JSON/GEOJSON 文件，直接解析
        //     parsedData = JSON.parse(content);
        // }

        // 在数据库中创建文件节点记录
        const fileNode = new FileNode({
            name: mainOriginalName,      // 文件名
            type: 'file',                     // 类型为文件
            parentId: parentId,                   // 默认放在根目录，后续可以根据需求调整
            path: mainFilePath,                   // 文件存储路径
            size: Number(renamedFilesMap['size']),              // 文件大小
            extension: mainExt,         // 文件扩展名
            mimeType: renamedFilesMap['mime']       // MIME类型
        });

        // 保存到数据库
        const savedFileNode = await fileNode.save();

        // 成功响应
        // 这里要和前端的 geoService.ts 中的 UploadResponse 接口对应
        res.status(200).json({
            code: 200,
            message: '文件上传并解析成功',
            data: {
                // 前端调用时会用到这些字段，名称注意要一致
                _id: savedFileNode._id,        // 返回数据库记录的ID
                fileName: mainOriginalName, // 返回原始文件名 (注意：这里是 fileName，不是 filename)
                geoJson: parsedData,            // 返回解析后的 GeoJSON 数据
                fileSize: savedFileNode.size,        // 文件大小
                fileType: mainExt         // 文件类型
            }
        });

    } catch (error: any) {
        console.error('文件上传处理错误:', error);

        // 错误响应
        res.status(500).json({
            code: 500,
            message: `文件处理失败: ${error.message}`,
            data: null
        });
    }
};

/**
 * 创建文件夹控制器
 * 在数据库中创建一个新的文件夹记录
 */
export const createFolder = async (req: Request, res: Response) => {
    try {
        const { name, parentId } = req.body;

        // 验证必要参数
        if (!name) {
            return res.status(400).json({
                code: 400,
                message: '名称不能为空',
                data: null
            });
        }

        // 验证 parentId（如果不是根目录，则必须是有效的ObjectId）
        if (parentId !== null && parentId !== undefined && parentId !== '') {
            if (!parentId.match(/^[0-9a-fA-F]{24}$/)) { // 简单验证ObjectId格式
                return res.status(400).json({
                    code: 400,
                    message: '无效的父级ID格式',
                    data: null
                });
            }
        }

        // 检查同名文件夹是否已存在
        const existingFolder = await FileNode.findOne({
            name: name,
            parentId: parentId || null,
            type: 'folder'
        });

        if (existingFolder) {
            return res.status(409).json({
                code: 409,
                message: '同名文件夹已存在',
                data: null
            });
        }

        // 创建文件夹节点
        const folderNode = new FileNode({
            name: name,
            type: 'folder',
            parentId: parentId || null,  // 如果没有指定父ID，则为根目录
        });

        // 保存到数据库
        const savedFolderNode = await folderNode.save();

        // 成功响应
        res.status(200).json({
            code: 200,
            message: '文件夹创建成功',
            data: {
                _id: savedFolderNode._id,
                name: savedFolderNode.name,
                parentId: savedFolderNode.parentId,
                type: 'folder'
            }
        });

    } catch (error: any) {
        console.error('创建文件夹错误:', error);

        // 错误响应
        res.status(500).json({
            code: 500,
            message: `创建文件夹失败: ${error.message}`,
            data: null
        });
    }
};

/**
 * 获取文件树控制器
 * 从数据库查询所有文件节点并转换为树形结构
 */
export const getFileTree = async (req: Request, res: Response) => {
    try {
        // 从数据库查询所有文件节点
        const fileNodes = await FileNode.find({}).sort({ parentId: 1, createdAt: 1 });

        // 将扁平数组转换为树形结构
        const treeData = buildTreeFromFlatArray(fileNodes);

        // 成功响应
        res.status(200).json({
            code: 200,
            message: '获取文件树成功',
            data: treeData
        });

    } catch (error: any) {
        console.error('获取文件树错误:', error);

        // 错误响应
        res.status(500).json({
            code: 500,
            message: `获取文件树失败: ${error.message}`,
            data: null
        });
    }
};

// 这是一个新函数，用于前端点击文件时获取内容
export const getFileContent = async (req: Request, res: Response) => {
    try {
        // req.params 是 Request Parameters（请求参数）
        const { id } = req.params; 
        const fileNode = await FileNode.findById(id);

        if (!fileNode) {
            return res.status(404).json({ code: 404, message: '文件记录不存在' });
        }

        // 🚨【修复点】先检查 path 是否存在
        // 如果是文件夹类型，或者数据异常，path 可能为空
        if (!fileNode.path) {
            return res.status(400).json({ code: 400, message: '文件路径不存在，无法读取' });
        }

        // 🚨【修复点 2】使用绝对路径 (解决 Windows 下路径拼接问题)
        // 数据库存的是 relative path (uploads/xx.json)，读取时要转为 absolute path
        const absolutePath = path.resolve(process.cwd(), fileNode.path);

        // 🚨【修复点 3】将 readFileSync 改为异步 await readFile，并增加文件丢失的捕获

        try {
            // 🚨 readAndParseFile 现在支持自动寻找 .dbf
            const { data } = await readAndParseFile(absolutePath, fileNode.extension);
            res.status(200).json({ code: 200, data: data });
        } catch (readError: any) {
            if (readError.message && readError.message.includes('物理文件')) {
                return res.status(404).json({ code: 404, message: '物理文件丢失或不完整' });
            }
            throw readError;
        }

        // // 🚨【修复部分】根据后缀名决定如何处理数据
        // let responseData: any;
        // // 获取后缀 (优先用数据库里的 extension，没有就从文件名取)
        // const ext = (fileNode.extension || path.extname(fileNode.name)).toLowerCase();
        // if (ext === '.json' || ext === '.geojson') {
        //     try {
        //         // 只有 JSON 才 parse
        //         responseData = JSON.parse(content);
        //     } catch (e) {
        //         // 防止 JSON 文件本身损坏导致报错
        //         return res.status(500).json({ code: 500, message: 'JSON 文件格式错误，解析失败' });
        //     }
        // } else if (ext === '.csv') {
        //     // ✅ 对于 CSV，暂时直接返回文本内容
        //     // (如果你后续想在前端显示表格，可以在这里用 csv-parser 库把它转成 JSON 数组)
        //     responseData = content; 
            
        //     // 或者，如果你想让前端拿到一个标准结构，可以暂时包装一下：
        //     // responseData = { type: 'csv', raw: content };
        // } else {
        //     // 其他类型默认返回文本
        //     responseData = content;
        // }

        // res.status(200).json({
        //     code: 200,
        //     data: responseData
        // });
    } catch (error: any) {
        console.error('获取内容失败:', error);
        res.status(500).json({ code: 500, message: error.message });
    }
};

/**
 * 重命名节点
 * PUT /api/files/:id
 */
export const renameNode = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name) return res.status(400).json({ code: 400, message: '名称不能为空' });

        const node = await FileNode.findById(id);
        if (!node) return res.status(404).json({ code: 404, message: '文件不存在' });

        // 更新名称
        node.name = name;
        
        // 触发 save，这样 FileNode.ts 里的 pre('save') 钩子会自动更新 extension 后缀
        await node.save(); 

        res.status(200).json({ code: 200, message: '重命名成功', data: node });
    } catch (error: any) {
        // 处理唯一索引冲突 (同目录下重名)
        if (error.code === 11000) {
            return res.status(409).json({ code: 409, message: '该目录下已存在同名文件' });
        }
        res.status(500).json({ code: 500, message: error.message });
    }
};

/**
 * 递归删除文件夹及其子节点的辅助函数
 */
const deleteFolderRecursive = async (folderId: string) => {
    // 1. 找到该文件夹下的所有子节点
    const children = await FileNode.find({ parentId: folderId });

    for (const child of children) {
        if (child.type === 'folder') {
            // 如果是文件夹，递归删除
            await deleteFolderRecursive(child._id.toString());
        } else {
            if (child.path) {
                try {
                    const absolutePath = path.resolve(process.cwd(), child.path);
                    // 检查文件是否存在，存在则删除
                    await fsPromises.access(absolutePath); 
                    await fsPromises.unlink(absolutePath); 
                    console.log(`🗑️ 已物理删除文件: ${child.name}`);
                } catch (error: any) {
                    // 如果文件不存在 (ENOENT)，说明已经被删了，忽略错误继续删数据库记录
                    if (error.code !== 'ENOENT') {
                        console.error(`物理文件删除失败 [${child.name}]:`, error);
                    }
                }
            }
        }
        // 删除数据库中子节点记录
        await FileNode.findByIdAndDelete(child._id);
    }
};

/**
 * 删除节点
 * DELETE /api/files/:id
 */
export const deleteNode = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const node = await FileNode.findById(id);
        if (!node) return res.status(404).json({ code: 404, message: '文件不存在' });
        
        const deleteRecursive = async (pid: string) => {
            const children = await FileNode.find({ parentId: pid });
            for (const child of children) {
                if (child.type === 'folder') await deleteRecursive(child._id.toString());
                else await deletePhysicalFiles(child.path);

                // 删除数据库记录
                await FileNode.findByIdAndDelete(child._id);
            }
        };
        const deletePhysicalFiles = async (filePath?: string) => {
            if (!filePath) return;
            const absPath = path.resolve(process.cwd(), filePath);
            const ext = path.extname(absPath).toLowerCase();
            
            // 如果是 shp，顺便删掉关联文件
            if (ext === '.shp') {
                const extensions = ['.shp', '.shx', '.dbf', '.prj', '.cpg'];
                for (const e of extensions) {
                    const relatedPath = absPath.replace(/\.shp$/i, e);
                    // 删除关联文件（在硬盘，物理删除）
                    try { await fsPromises.unlink(relatedPath); } catch(e) {}
                }
            } else {
                try { await fsPromises.unlink(absPath); } catch(e) {}
            }
        };

        // 如果是文件夹，先递归删除所有子内容
        if (node.type === 'folder') {
            await deleteRecursive(node._id.toString());
        } else {
            // if (node.path) {
            //     try {
            //         const absolutePath = path.resolve(process.cwd(), node.path);
            //         await fsPromises.access(absolutePath); // 检查存在性
            //         await fsPromises.unlink(absolutePath); // 执行删除
            //         console.log(`🗑️ 已物理删除文件: ${node.name}`);
            //     } catch (error: any) {
            //         // 忽略文件不存在的错误
            //         if (error.code !== 'ENOENT') {
            //             console.error(`物理文件删除失败 [${node.name}]:`, error);
            //         }
            //     }
            // }
            await deletePhysicalFiles(node.path);
        }

        // 删除节点本身
        await FileNode.findByIdAndDelete(id);
        res.status(200).json({ code: 200, message: '删除成功' });
    } catch (error: any) {
        res.status(500).json({ code: 500, message: error.message });
    }
};


/**
 * 🚨【修改后】更新文件内部数据
 * 使用 fsPromises 来支持 await
 */
export const updateFileData = async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    const { rowIndex, data } = req.body; 

    // 1. 数据库校验
    const fileNode = await FileNode.findById(fileId);
    if (!fileNode) {
      return res.status(404).json({ code: 404, message: '文件不存在' });
    }

    if (fileNode.type === 'folder' || !fileNode.path) {
      return res.status(400).json({ code: 400, message: '目标不是有效的文件' });
    }

    const absolutePath = path.resolve(process.cwd(), fileNode.path);

    // 3. 读取物理文件内容
    // 🚨【修改点 1】使用 fsPromises.readFile
    const fileContent = await fsPromises.readFile(absolutePath, 'utf-8');
    const geoJson = JSON.parse(fileContent);

    // 4. 核心修改逻辑
    if (
      geoJson.type === 'FeatureCollection' && 
      Array.isArray(geoJson.features) && 
      geoJson.features[rowIndex]
    ) {
        const targetFeature = geoJson.features[rowIndex];

        targetFeature.properties = {
            ...targetFeature.properties,
            ...data
        };

        if (targetFeature.properties._geometry) delete targetFeature.properties._geometry;
        if (targetFeature.properties.cp) delete targetFeature.properties.cp;
        if (targetFeature.properties._cp) delete targetFeature.properties._cp;

        // 5. 写回硬盘
        // 🚨【修改点 2】使用 fsPromises.writeFile
        await fsPromises.writeFile(absolutePath, JSON.stringify(geoJson, null, 2), 'utf-8');

        fileNode.updatedAt = new Date();
        await fileNode.save();

        console.log(`✅ [Update] 文件 "${fileNode.name}" 第 ${rowIndex} 行数据已更新`);
        
        return res.status(200).json({ 
            code: 200, 
            message: '保存成功',
            data: { updatedAt: fileNode.updatedAt }
        });

    } else {
        return res.status(400).json({ 
            code: 400, 
            message: 'GeoJSON 结构不匹配或行索引越界，无法更新' 
        });
    }

  } catch (error: any) {
    console.error('❌ 更新文件失败:', error);
    return res.status(500).json({ 
        code: 500, 
        message: '服务器内部错误: ' + error.message 
    });
  }
};

/**
 * 新增行 (Add Row)
 */
export const addRow = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const fileNode = await FileNode.findById(id);
        if (!fileNode || !fileNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });

        const absolutePath = path.resolve(process.cwd(), fileNode.path);
        
        // 🚨【关键修改】传入 fileNode.extension，告诉解析器这是个 json 文件
        const { type, data } = await readAndParseFile(absolutePath, fileNode.extension);

        if (type === 'json' && data.type === 'FeatureCollection') {
            if (!Array.isArray(data.features)) {
                data.features = [];
            }
            
            const newFeature = {
                type: 'Feature',
                properties: {
                    id: Date.now().toString(),
                    name: 'New Feature'
                },
                geometry: null
            };
            data.features.push(newFeature);
            
            await saveFile(absolutePath, type, data);
            
            fileNode.markModified('updatedAt');
            await fileNode.save();

            res.status(200).json({ code: 200, message: '新增行成功', data: data }); 
        } 
        else if (type === 'csv') {
            res.status(501).json({ code: 501, message: 'CSV 暂不支持增行' });
        } else {
            res.status(400).json({ code: 400, message: '只支持 GeoJSON 格式' });
        }
    } catch (error: any) {
        console.error('新增行失败:', error);
        res.status(500).json({ code: 500, message: error.message });
    }
};

/**
 * 删除行
 */
export const deleteRow = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { rowIndex } = req.body;

        const fileNode = await FileNode.findById(id);
        if (!fileNode || !fileNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });

        const absolutePath = path.resolve(process.cwd(), fileNode.path);
        // 🚨 传入 extension
        const { type, data } = await readAndParseFile(absolutePath, fileNode.extension);

        if (type === 'json' && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            if (rowIndex >= 0 && rowIndex < data.features.length) {
                data.features.splice(rowIndex, 1);
                await saveFile(absolutePath, type, data);
                
                fileNode.markModified('updatedAt');
                await fileNode.save();
                
                res.status(200).json({ code: 200, message: '删除行成功' });
            } else {
                res.status(400).json({ code: 400, message: '无效的行索引' });
            }
        } else {
            res.status(400).json({ code: 400, message: '不支持的文件结构' });
        }
    } catch (error: any) {
        console.error('删除行失败:', error);
        res.status(500).json({ code: 500, message: error.message });
    }
};

/**
 * 新增列
 */
export const addColumn = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { fieldName, defaultValue } = req.body;
        if (!fieldName) return res.status(400).json({ code: 400, message: '列名不能为空' });

        const fileNode = await FileNode.findById(id);
        if (!fileNode || !fileNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });

        const absolutePath = path.resolve(process.cwd(), fileNode.path);
        // 🚨 传入 extension
        const { type, data } = await readAndParseFile(absolutePath, fileNode.extension);

        if (type === 'json' && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            data.features.forEach((feature: any) => {
                if (!feature.properties) feature.properties = {};
                if (!Object.prototype.hasOwnProperty.call(feature.properties, fieldName)) {
                    feature.properties[fieldName] = defaultValue || '';
                }
            });
            await saveFile(absolutePath, type, data);
            
            fileNode.markModified('updatedAt');
            await fileNode.save();

            res.status(200).json({ code: 200, message: '新增列成功' });
        } else {
            res.status(400).json({ code: 400, message: '不支持的文件结构' });
        }
    } catch (error: any) {
        console.error('新增列失败:', error);
        res.status(500).json({ code: 500, message: error.message });
    }
};

/**
 * 删除列
 */
export const deleteColumn = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { fieldName } = req.body;
        const protectedFields = ['id', 'name', 'cp']; 
        if (protectedFields.includes(fieldName)) return res.status(400).json({ code: 400, message: '关键字段禁止删除' });

        const fileNode = await FileNode.findById(id);
        if (!fileNode || !fileNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });

        const absolutePath = path.resolve(process.cwd(), fileNode.path);
        // 🚨 传入 extension
        const { type, data } = await readAndParseFile(absolutePath, fileNode.extension);

        if (type === 'json' && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            data.features.forEach((feature: any) => {
                if (feature.properties) {
                    delete feature.properties[fieldName];
                }
            });
            await saveFile(absolutePath, type, data);
            
            fileNode.markModified('updatedAt');
            await fileNode.save();

            res.status(200).json({ code: 200, message: '删除列成功' });
        } else {
            res.status(400).json({ code: 400, message: '不支持的文件结构' });
        }
    } catch (error: any) {
        console.error('删除列失败:', error);
        res.status(500).json({ code: 500, message: error.message });
    }
};