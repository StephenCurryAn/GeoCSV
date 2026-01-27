// 因为 Multer 存硬盘的代码和控制器处理数据的代码，                                                                                                                        │
// 不在同一个文件里面，所以不好将路径这个参数传递，只好通过 req 的方式，所以需要req                                                                                        │
// Multer存到硬盘之后，但是控制器还不知道这个文件路径是什么，所以需要req                                                                                                   │
// 先进行Multer存硬盘这个步骤，然后进行控制器处理数据这个步骤，并返回回复

import e, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import vm from 'vm'; // 引入 Node.js 虚拟机模块，用于动态执行代码
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';
const fsPromises = fs.promises; // 使用这种方式获取 promises，兼容性最好，防止 undefined 报错
import FileNode from '../models/FileNode'; // 导入文件节点模型

// 全局环境补丁 (模拟浏览器环境)
const g = global as any;
if (!g.self) g.self = g;
if (!g.window) g.window = g; // 有些库也会检查 window
if (!g.document) g.document = {}; // 防止访问 document 报错

/**
 * 函数作用：读取文件并自动检测，转换编码，返回字符串内容
 * 用到jschardet和iconv-lite库
 */
async function readFileContent(filePath: string): Promise<string> {
    // fsPromises.readFile(filePath) 返回的是一个 Buffer 对象，格式是原始的二进制数据
    // <Buffer 48 65 6c 6c 6f 20 57 6f 72 6c 64>
    // 存储在内存里时： 它是 二进制（Binary）。
    // 打印在屏幕上时： 它是 十六进制（Hexadecimal）。
    // 传输在网络上时： 它是 Base64 编码（Base64）。
    // 不同的编码方式，只是表现形式不同，本质上它们都是同一份二进制数据。
    const buffer = await fsPromises.readFile(filePath);
    
    // 1. 检测编码
    // jschardet: 这是一个第三方库（源自 Python 的 chardet）。它是一个“侦探”。
    // .detect(buffer): 你把那堆看不懂的二进制数据（buffer）扔给它，它会分析里面的字节规律。
    // 返回结果 (detection): 这是一个对象，通常包含两个关键属性：
    // encoding: 它猜测的编码名称（比如 'UTF-8', 'Big5', 'GB2312'）。
    // confidence: 置信度（0 到 1 之间的数字），表示它有多大把握猜对了。
    const detection = jschardet.detect(buffer);
    let encoding = detection.encoding || 'utf-8';
    console.log(`🔍 [Encoding Detect] 检测到文件编码: ${encoding} (置信度: ${detection.confidence})`);

    // 2. 修正常见误判 (GB2312/GBK 家族统一用 GB18030 解码最稳)
    const upperEnc = encoding.toUpperCase();
    if (upperEnc === 'GB2312' || upperEnc === 'GBK' || upperEnc === 'GB18030' || upperEnc === 'WINDOWS-1252') {
        // 有时候 jschardet 会把中文误判为 windows-1252，如果内容看起来是中文 CSV，强制尝试 GBK 往往更准
        // 这里简单处理：如果是 GB 系列，统一用 gbk
        encoding = 'gbk';
    }

    // 3. 解码为字符串
    // iconv: 这里指的是 iconv-lite 库，它是 Node.js 中处理非 UTF-8 编码的事实标准。
    // 过程：它拿着密码本，把二进制数据翻译成 JavaScript 内部认识的字符串（Unicode）。
    // 输出：返回人类可读的字符串内容。
    return iconv.decode(buffer, encoding);
}

/**
 * 函数作用：将 Node.js Buffer 转换为 ArrayBuffer
 * 把 Node.js 专用的二进制格式 (Buffer)，手动“搬运”成浏览器通用的标准二进制格式 (ArrayBuffer)
 */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
    // new ArrayBuffer(...): 申请一块新的内存空间。
    // buf.length: 这里的逻辑是：“原来的数据有多少个字节，我就申请多大的新空间。”
    // 状态: 此时 ab 是一块全新的、全是 0 的内存区域。
    // 注意: ArrayBuffer 是只读的或者说是不可直接操作的。你不能直接写 ab[0] = 1，
    // 你必须通过“视图（View）”来操作它。
    const ab = new ArrayBuffer(buf.length);
    // Uint8Array: 全称是 Unsigned Integer 8-bit Array（无符号8位整数数组）。
    // 意思是把内存切成一个一个字节（Byte）来看待，范围是 0-255
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}

/**
 * 函数作用：确保每一行数据都有 ID；防止行顺序改变的时候，各行数据更新的时候会发生错误
 * 如果发现没有 id，就用 "timestamp_index" 生成一个
 */
function ensureIds(data: any): any {
    if (!data) return data;
    console.log('这里是文件控制器里面的ensureIds函数中的data：',data)
    // 情况 1: GeoJSON FeatureCollection
    if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
        data.features.forEach((f: any, index: number) => {
            if (!f.properties) f.properties = {};
            // 检查 properties.id 是否存在 (包括 null, undefined, "")
            if (f.properties.id == null || f.properties.id === '') {
                // 生成虚拟 ID (例如: gen_1706688_0)
                f.properties.id = `gen_${Date.now()}_${index}`;
            }
            // 同步顶层 ID (可选，为了兼容某些地图库)
            if (!f.id) f.id = f.properties.id;
        });
    }
    // 情况 2: 普通数组 (JSON Array)
    else if (Array.isArray(data)) {
        data.forEach((item: any, index: number) => {
            if (item.id == null || item.id === '') {
                item.id = `gen_${Date.now()}_${index}`;
            }
        });
    }
    return data;
}

/**
 * 函数作用：递归计算数组的嵌套深度
 */
function getArrayDepth(value: any): number {
    return Array.isArray(value) ? 1 + Math.max(0, ...value.map(getArrayDepth)) : 0;
}

/**
 * 函数作用：绕过 package.json "exports" 限制，直接读取源码并执行，手动加载 shpjs 库
 * 用到了 vm 模块
 */
async function loadShpLibrary() {
    // 1. 尝试找到库文件的物理路径
    const possiblePaths = [
        path.join(process.cwd(), 'node_modules/shpjs/dist/shp.js'), //一般来说应该是这个
        path.join(__dirname, '../../node_modules/shpjs/dist/shp.js'), // 一般来说也应该是这个
        path.join(__dirname, '../node_modules/shpjs/dist/shp.js')
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
 * 函数作用：CSV 转 GeoJSON 核心逻辑，允许保留没有几何数据的普通行（防止增行后不显示）
 * 用到了 PapaParse 库 和 getArrayDepth 函数
 */
function parseCsvToGeoJSON(csvString: string) {
    // PapaParse 库（JavaScript 中最流行的 CSV 解析库）
    // header: true: 告诉解析器第一行是表头（字段名）。解析出的 data 将是对象数组（例如 [{ "name": "A", "lat": 10 }, ...]），而不是二维数组。
    // skipEmptyLines: 自动跳过空行，防止报错。
    // dynamicTyping: 自动类型转换。比如 CSV 里的 "123" 会自动变成数字 123，"true" 变成布尔值 true。
    const result = Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true
    });

    // 告诉 TypeScript 我们确定 data 是 any[] 数组类型
    const data = result.data as any[];
    // 空检查: 如果解析结果为空，直接返回空数据
    if (!data || data.length === 0) return { isGeo: false, data: [] };
    // 尝试从元数据 (meta.fields) 获取列名列表，如果失败则取第一行数据的 key。这是后续查找关键词的基础
    const headers = result.meta.fields || Object.keys(data[0]);
    
    // --- 1. 定义关键词 ---
    // 箭头函数 h => ，h代表headers数组里的每一个元素（列名） 
    const geomKeywords = ['geometry', 'geom', 'wkt', 'the_geom', '几何', '几何数据', '几何坐标数据', '几何坐标数据 (geometry)'];
    const typeKeywords = ['type', 'geometrytype', '图层类型', '类型', 'shapetype'];
    const latKeywords = ['lat', 'latitude', 'wd', 'y', 'y_coord', '纬度'];
    const lonKeywords = ['lon', 'lng', 'longitude', 'jd', 'x', 'x_coord', '经度'];

    // --- 2. 寻找匹配的列 ---
    const geomKey = headers.find(h => geomKeywords.includes(h.toLowerCase()));
    const typeKey = headers.find(h => typeKeywords.includes(h.toLowerCase()));
    const latKey = headers.find(h => latKeywords.includes(h.toLowerCase()));
    const lonKey = headers.find(h => lonKeywords.includes(h.toLowerCase()));

    // --- 3. 策略 A: 优先处理 "几何列" ---
    if (geomKey) {
        console.log(`[CSV Parser] 发现几何列: [${geomKey}]`);
        
        // row表示data 数组里的第 N 个元素
        // index是当前元素的索引值，从0开始，是自动传入计数的
        const features = data.map((row, index) => {
            const rawGeom = row[geomKey];
            // 值还是和原来一样，“...”这是引用展开运算符，把 row 里面的所有字段都复制一份
            // 为了防止修改原始数据，这里是浅拷贝，例如：
            // {
            //     name: "天安门",
            //     city: "Beijing",
            //     id: 101
            // }
            const properties = { ...row };
            // 确保有 ID
            properties.id = properties.id || properties.OSM_ID || `csv_${index}`;

            // 如果几何数据为空，保留该行，但 geometry 为 null
            if (!rawGeom) {
                // 如果需要，可以把 geomKey 从属性中删掉，或者保留它
                // delete properties[geomKey]; 
                return {
                    type: 'Feature',
                    geometry: null, // 空几何
                    properties: properties
                };
            }

            let coordinates = null;
            let geoType = 'Unknown';

            try {
                if (typeof rawGeom === 'string') {
                    if (rawGeom.trim().startsWith('[') || rawGeom.trim().startsWith('{')) {
                        // 它把死板的文本字符串，变成活生生的 JavaScript 对象或数组。
                        coordinates = JSON.parse(rawGeom);
                    } 
                } else if (Array.isArray(rawGeom)) {
                    coordinates = rawGeom;
                }
            } catch (e) {
                // 解析出错也当作无几何数据保留，而不是丢弃
                return {
                    type: 'Feature',
                    geometry: null,
                    properties: properties
                };
            }

            if (!coordinates) {
                 return {
                    type: 'Feature',
                    geometry: null,
                    properties: properties
                };
            }

            // 几何类型推断
            // 代码先看有没有专门的 type 列。
            // 如果没有，它通过计算数组的深度来猜：
            // 深度 1 ([116, 39]) -> 点
            // 深度 2 ([[116, 39], [117, 40]]) -> 线
            // 深度 3 ([[[116, 39], ...]]) -> 面
            if (typeKey && row[typeKey]) {
                geoType = row[typeKey]; 
                if (geoType.toLowerCase().includes('polygon')) geoType = 'Polygon';
                if (geoType.toLowerCase().includes('line')) geoType = 'LineString';
                if (geoType.toLowerCase().includes('point')) geoType = 'Point';
            } else {
                if (Array.isArray(coordinates)) {
                    const depth = getArrayDepth(coordinates);
                    if (depth === 1) geoType = 'Point';
                    else if (depth === 2) geoType = 'LineString';
                    else if (depth === 3) geoType = 'Polygon';
                    else if (depth === 4) geoType = 'MultiPolygon';
                }
            }

            delete properties[geomKey]; // 移除原始大字段，避免冗余

            return {
                type: 'Feature',
                geometry: {
                    type: geoType,
                    coordinates: coordinates
                },
                properties: properties
            };
        }).filter(f => f !== null);

        return {
            isGeo: true,
            data: { type: 'FeatureCollection', features: features }
        };
    }

    // --- 4. 策略 B: 处理 "经纬度列" ---
    if (latKey && lonKey) {
        console.log(`[CSV Parser] 发现经纬度列: [${lonKey}, ${latKey}]`);
        
        const features = data.map((row, index) => {
            const lat = parseFloat(row[latKey]);
            const lon = parseFloat(row[lonKey]);
            
            // 如果经纬度无效，保留行，geometry 设为 null
            if (isNaN(lat) || isNaN(lon)) {
                return {
                    type: 'Feature',
                    geometry: null,
                    properties: {
                        ...row,
                        id: row.id || `csv_${index}`
                    }
                };
            }

            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat]
                },
                properties: {
                    ...row,
                    id: row.id || `csv_${index}`
                }
            };
        }).filter(f => f !== null);

        return {
            isGeo: true,
            data: { type: 'FeatureCollection', features: features }
        };
    }

    // --- 5. 策略 C: 普通表格 ---
    console.log('[CSV Parser] 未识别到空间信息，作为普通表格处理');
    return { isGeo: false, data: data };
}

/**
 * 函数作用：读取并解析文件，返回内容和类型
 * 用到了loadShpLibrary函数和toArrayBuffer函数和readFileContent函数和parseCsvToGeoJSON函数
 * const shp = await loadShpLibrary();
 * const shpArrayBuffer = toArrayBuffer(shpNodeBuffer);
 * const content = await readFileContent(filePath);
 * const { isGeo, data } = parseCsvToGeoJSON(content);
 * 
 * 增加了 dbExtension 参数，优先使用数据库存的后缀，防止物理文件名被改乱（如 .json_12345）导致识别失败
 * 此处因为前面修改了一些代码，所以根本不会有物理文件名被改乱的问题（因为upload函数定义文件节点的时候，
 * 就上传的是正确的文件名（没有被乱改）），
 * 但为了保险起见，还是保留这个参数
 */
// 这里传进去的filePath是新修改的带有唯一标识符的物理路径，并且是绝对路径
const readAndParseFile = async (filePath: string, dbExtension?: string) => {
    // 1. 检查物理文件是否存在
    try {
        await fsPromises.access(filePath);
    } catch {
        throw new Error(`物理文件丢失，路径: ${filePath}`);
    }

    // 2. 确定使用的后缀名
    // 其实这个地方的dbExtension永远不会undefined，因为uploadFile函数里传进去的时候，
    // 传进去的就是数据库存的后缀名，dbExtension和path.extname(filePath).toLowerCase()是一样的东西
    let ext = dbExtension || path.extname(filePath);
    ext = ext.toLowerCase();
    console.log(`[FileController] 正在读取: ${path.basename(filePath)} | 识别后缀: ${ext}`);
    
    // Shapefile 专用逻辑
    if (ext === '.shp') {
        console.log('🔄 [Parser] 开始解析 Shapefile:', path.basename(filePath));
        
        try {
            // A. 加载库
            const shp = await loadShpLibrary();

            // B. 读取文件并转换格式
            // 读取结果 shpNodeBuffer 是 Node.js 专用的 Buffer 类型 
            const shpNodeBuffer = await fsPromises.readFile(filePath);
            // shpjs 这个库最初是为浏览器设计的，它只认识标准的 JavaScript ArrayBuffer
            const shpArrayBuffer = toArrayBuffer(shpNodeBuffer); // 关键！
            
            // 找到文件名末尾（$）的 .shp，忽略大小写（i），把它分别替换成 .dbf 和 .shx 和 .prj等
            const dbfPath = filePath.replace(/\.shp$/i, '.dbf');
            const cpgPath = filePath.replace(/\.shp$/i, '.cpg');
            const prjPath = filePath.replace(/\.shp$/i, '.prj'); 

            let dbfArrayBuffer;
            try {
                const dbfNodeBuffer = await fsPromises.readFile(dbfPath);
                dbfArrayBuffer = toArrayBuffer(dbfNodeBuffer); // 关键！
            } catch (e) {
                throw new Error('缺少同名的 .dbf 文件');
            }
            
            // .cpg 文件里面通常只写了一个字符串，比如 "GBK" 或 "UTF-8"
            let encoding = 'utf-8'; // 默认兜底
            try {
                const cpgContent = await fsPromises.readFile(cpgPath, 'utf-8');
                // 必须 trim()，因为文件中可能包含换行符，会导致识别失败
                if (cpgContent && cpgContent.trim()) {
                    encoding = cpgContent.trim();
                    console.log(`[Parser] 检测到编码文件 (.cpg): ${encoding}`);
                }
            } catch (e) {
                // 如果没有 cpg，通常维持默认 utf-8，或者你可以根据业务写死 'gbk'
            }
            
            // catch { /* 忽略 */ }: 这里非常宽容。如果 .prj 丢失，
            // 通常默认会当作标准的 WGS84 经纬度处理，
            // 或者解析库能容忍缺失，所以这里选择“静默失败”，不打断流程。
            let prjString;
            try {
                // 注意这里没有转 ArrayBuffer，而是直接读成字符串。
                // 因为投影文件 (.prj) 里面存的是一段文本描述（WKT 格式）。
                prjString = await fsPromises.readFile(prjPath, 'utf-8');
            } catch (e) { /* 忽略 */ }


            // C. 解析
            let geojson = shp.combine([
                shp.parseShp(shpArrayBuffer, prjString), 
                shp.parseDbf(dbfArrayBuffer,encoding)
            ]);
            
            // 在返回前，强制补全 ID
            geojson = ensureIds(geojson);

            console.log('[Parser] Shapefile 解析成功!并补全了id');
            return { type: 'json', data: geojson };

        } catch (e: any) {
            console.error('[Parser] 错误:', e);
            throw new Error(`Shapefile 解析失败: ${e.message}`);
        }
    }
    // 2. CSV 处理逻辑
    if (ext === '.csv') {
        // const content = await fsPromises.readFile(filePath, 'utf-8');
        const content = await readFileContent(filePath);
        let { isGeo, data } = parseCsvToGeoJSON(content);
        // 补全id
        data = ensureIds(data);
        return { type: 'json', data: data }; // 总是返回 json 容器
    }
    // const content = await fsPromises.readFile(filePath, 'utf-8');
    const content = await readFileContent(filePath);
    
    if (ext === '.json' || ext === '.geojson') {
        try {
            let jsonData = JSON.parse(content);
            // 补全 ID
            jsonData = ensureIds(jsonData);
            return { type: 'json', data: jsonData };
        } catch (e) {
            throw new Error('JSON 文件内容格式错误，解析失败');
        }
    }
    // 默认当做文本返回
    return { type: 'text', data: content };
};

/**
 * 文件上传 控制器
 * 控制器作用：处理客户端上传的文件并将其解析为 GeoJSON 对象
 * 用到了 readAndParseFile 函数，readAndParseFile(mainFilePath, mainExt)
 * const result = await readAndParseFile(mainFilePath, mainExt);
 */
export const uploadFile = async (req: Request, res: Response) => {
    try {
        // 关键修改:获取 parentId
        // Multer 处理 FormData 时，文本字段会在 req.body 中
        // 前端传过来的可能是字符串 'null' 或 'undefined'，需要清洗
        /**
         * 这里的 req.body 是谁填充的？
         * 1.express.json() (在 index.ts 中配置)
         * 它负责监听普通的 JSON 数据。如果前端传的是 JSON，它会解析好放进 req.body
         * 2.Multer (在 fileRoutes.ts 中的 upload.array('files'))
         * 这是专门处理文件上传的中间件。
         * 它的工作：它拦截了请求，费劲地把二进制流里的“文件部分”切出来存硬盘，
         *          并把“文本字段”（比如 parentId）切出来
         * 它的结果：它把整理好的文件信息挂载到 req.files，把文本信息挂载到 req.body
         */
        let parentId = req.body.parentId;
        if (parentId === 'null' || parentId === 'undefined' || parentId === '') {
            parentId = null;
        }

        // 【新增】支持前端传递自定义名称 (clean name)
        // 如果前端在 FormData 里 append 了 'name' 字段，就用它；否则用文件名
        let customName = req.body.name; 
        if (customName === 'null' || customName === 'undefined') customName = '';

        // req.files 是一个数组 (因为我们用了 upload.array)
        // （文件名、存在哪了、多大、什么类型等）
        // 这段代码是 TypeScript 的类型断言，告诉编译器我们确定它是这个类型（数组）
        const files = req.files as Express.Multer.File[];

        // 检查是否有文件被上传
        if (!files || files.length === 0) {
            return res.status(400).json({
                code: 400,
                message: '没有文件被上传',
                data: null
            });
        }
        // 为了防止文件名冲突（因为我们在uploadConfig.ts中去掉了随机数），我们在这里统一给这一批文件重命名
        // 生成一个统一的时间戳ID
        // Math.round是四舍五入
        // Math.random()是生成0-1之间的随机小数
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
            // 这里面的file.path是Multer存硬盘时的路径（类似“E:\Project\uploads\test.shp”）
            const newFilename = `${basename}_${batchId}${ext}`;
            // path.dirname 是获取目录名，path.join是拼接路径
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
            // 如果上传了一堆文件但没有 .shp 也没有 .json或.csv，说明不完整或不支持
            // (比如只传了 .dbf)
            return res.status(400).json({ code: 400, message: '上传不完整：Shapefile 必须包含 .shp 文件' });
        }
        const mainFilePath = renamedFilesMap['main'];
        const mainOriginalName = renamedFilesMap['originalName'];
        const mainExt = path.extname(mainFilePath).toLowerCase();
        
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

        // 在数据库中创建文件节点记录
        const fileNode = new FileNode({
            name: mainOriginalName,      // 文件名
            type: 'file',                     // 类型为文件
            parentId: parentId,                   // 默认放在根目录，后续可以根据需求调整   
            //  path.resolve是把相对路径转为绝对路径;process.cwd()是获取当前工作目录(server根目录)
            // path: path.resolve(process.cwd(), mainFilePath),  
            path: mainFilePath,  //这里面的mainFilePath已经是绝对路径了
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
 * 创建文件夹 控制器
 * 控制器作用：在数据库中创建一个新的文件夹记录
 */
export const createFolder = async (req: Request, res: Response) => {
    try {
        // 这里面的req.body里面的一些属性是在前端的 geoService.ts 里被定义的
        // 这里面name在前端根本就没有被定义（后续要是需要这个参数，可以去前端的geoService.ts修改代码）
        const { name, parentId } = req.body;
        // const { parentId } = req.body;

        // 验证必要参数
        if (!name) {
            return res.status(400).json({
                code: 400,
                message: '名称不能为空',
                data: null
            });
        }
        // console.log(`[Create Folder] 尝试创建文件夹: ${name} | parentId: ${parentId}`);

        // 验证 parentId（如果不是根目录，则必须是有效的ObjectId）
        if (parentId !== null && parentId !== undefined && parentId !== '') {
            if (!parentId.match(/^[0-9a-fA-F]{24}$/)) { // 简单验证mongodb的ObjectId格式
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
        // 接口层：你现在看到的 res.json({ data: { _id: ... } }) 这段代码，
        // 是在 server/src/controllers/fileController.ts 里定义的。这是你在决定“我要给前端看什么字段”
        res.status(200).json({
            code: 200,
            message: '文件夹创建成功',
            // 数据库层：_id, name, parentId, type 这些值的来源和格式，
            // 是在 server/src/models/FileNode.ts 里定义的。那是你的“数据库字典”。
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
 * 函数作用：将扁平数组转换为树形结构的辅助函数
 * @param nodes 扁平的文件节点数组
 * @returns 树形结构的文件节点数组
 */
function buildTreeFromFlatArray(nodes: any[]) {
    // 创建一个映射，便于快速查找节点
    // 作用: 用来充当索引。以后我们想找某个 ID 对应的节点，
    // 直接 nodeMap[id] 就能拿到，不需要遍历数组。这能把算法效率大大提高（从 O(n²) 提升到 O(n)）。
    const nodeMap: { [key: string]: any } = {};
    // 一个空数组。最终生成的树形结构（所有的根节点）都会放在这里面。
    const tree: any[] = [];

    // 首先创建所有节点的映射
    // ._doc 是 Mongoose 库自带的一个内部属性
    // 核心数据，就存放在 ._doc 属性里
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
 * 获取文件树 控制器
 * 控制器作用：从数据库查询所有文件节点并转换为树形结构
 * 用到了 buildTreeFromFlatArray 函数
 */
export const getFileTree = async (req: Request, res: Response) => {
    try {
        // 从数据库查询所有文件节点
        // FileNode 是 Mongoose 模型，相当于拥有进入数据库（MongoDB）的所有钥匙，能去读写数据
        // fileNodes就是FileNode模型去数据库里查到的所有文件节点记录，按parentId和createdAt排序得到的
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

/**
 * 获取文件内容 控制器
 * 控制器作用：读取 指定 文件的内容并返回给客户端
 * 用于前端点击文件时，通过 ID 获取文件内容 (按需加载)
 */
export const getFileContent = async (req: Request, res: Response) => {
    try {
        console.log('🔥 这里的代码被执行了吗？ID是:', req.params.id);
        // req.params 是 Request Parameters（请求参数）
        // 前端发起请求的时候，类似于http://localhost:3000/api/files/content/65a1b2c...
        // “id”是router.get('/content/:id', getFileContent);中定义的
        // 其告诉框架：“嘿，content/ 后面跟着的那一串东西，不是固定的路径，而是一个变量（占位符）。”
        const { id } = req.params; 
        const fileNode = await FileNode.findById(id);

        if (!fileNode) {
            return res.status(404).json({ code: 404, message: '文件记录不存在' });
        }

        // 先检查 path 是否存在
        // 如果是文件夹类型，或者数据异常，path 可能为空
        if (!fileNode.path) {
            return res.status(400).json({ code: 400, message: '文件路径不存在，无法读取' });
        }

        // 使用绝对路径 (解决 Windows 下路径拼接问题)
        // 数据库存的是 relative path (uploads/xx.json)，读取时要转为 absolute path
        // path.resolve会把参数里的路径片段拼起来，并确保生成一个绝对路径
        const absolutePath = path.resolve(process.cwd(), fileNode.path);

        // 将 readFileSync 改为异步 await readFile，并增加文件丢失的捕获
        try {
            // readAndParseFile 现在支持自动寻找 .dbf
            const { data } = await readAndParseFile(absolutePath, fileNode.extension);
            res.status(200).json({ code: 200, data: data });
        } catch (readError: any) {
            if (readError.message && readError.message.includes('物理文件')) {
                return res.status(404).json({ code: 404, message: '物理文件丢失或不完整' });
            }
            throw readError;
        }
    } catch (error: any) {
        console.error('获取内容失败:', error);
        res.status(500).json({ code: 500, message: error.message });
    }
};

/**
 * 重命名节点 控制器
 * PUT /api/files/:id
 */
export const renameNode = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // name是await apiClient.put(`/files/${id}`, { name: newName })中所传的
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
 * 删除节点 控制器
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
 * 函数作用：将 GeoJSON 转换为 CSV 字符串
 * 用于将修改后的数据写回 CSV 文件
 */
function geoJSONToCSV(geoJSON: any): string {
    if (!geoJSON || !Array.isArray(geoJSON.features)) return '';

    // 将 FeatureCollection 扁平化为数组
    const flatData = geoJSON.features.map((feature: any) => {
        // 1. 获取所有属性
        const row = { ...feature.properties };
        
        // 移除内部字段 (如 __csv_id)
        Object.keys(row).forEach(k => {
            if (k.startsWith('__')) delete row[k];
        });

        // 2. 处理几何信息
        if (feature.geometry) {
            if (feature.geometry.type === 'Point' && Array.isArray(feature.geometry.coordinates)) {
                // 如果是点，确保有经纬度列
                // 优先使用原有的 lat/lon 字段名，如果没有则新建
                if (!row.lng && !row.longitude && !row.x) row.lng = feature.geometry.coordinates[0];
                if (!row.lat && !row.latitude && !row.y) row.lat = feature.geometry.coordinates[1];
            } else {
                // 如果是面/线，将坐标存入 geometry 列
                // 这里我们统一用 "geometry" 作为列名
                row['geometry'] = JSON.stringify(feature.geometry.coordinates);
            }
        }
        return row;
    });

    // 使用 PapaParse 反向解析为 CSV 字符串
    return Papa.unparse(flatData);
}

/**
 * 函数作用：智能保存，根据文件类型决定保存策略
 * 并同步更新数据库中的文件大小 (size)
 * 用到了geoJSONToCSV函数
 */
const saveDataSmart = async (fileNode: any, geoJsonData: any) => {
    const absolutePath = path.resolve(process.cwd(), fileNode.path);
    const ext = fileNode.extension.toLowerCase();
    
    // 定义一个变量来存最终的文件路径，用于计算大小
    let finalPath = absolutePath;

    // 策略 A: CSV -> 转回 CSV 文本
    if (ext === '.csv') {
        const csvString = geoJSONToCSV(geoJsonData);
        await fsPromises.writeFile(absolutePath, csvString, 'utf-8');
        console.log(`💾 CSV 文件已更新: ${fileNode.name}`);
    }

    // 策略 B: SHP -> 迁移为 JSON
    else if (ext === '.shp') {
        console.log(`检测到 SHP 编辑，正在转换为 GeoJSON 以便保存...`);
        
        // path.dirname()是从一个完整的文件路径中，剥离出它所在的“文件夹路径”（父目录）
        const dir = path.dirname(absolutePath);
        const basename = path.basename(absolutePath, '.shp'); 
        const newFileName = `${basename}.json`;
        const newPath = path.join(dir, newFileName);

        // 写入 JSON
        await fsPromises.writeFile(newPath, JSON.stringify(geoJsonData, null, 2), 'utf-8');

        // 删除旧 SHP 文件
        const extensions = ['.shp', '.shx', '.dbf', '.prj', '.cpg'];
        for (const e of extensions) {
            const oldFile = path.join(dir, `${basename}${e}`);
            try { await fsPromises.unlink(oldFile); } catch(e) {}
        }

        // 更新节点信息
        // fileNode.path = path.relative(process.cwd(), newPath);
        fileNode.path = newPath;
        fileNode.extension = '.json';
        fileNode.name = newFileName;
        fileNode.mimeType = 'application/json';
        
        finalPath = newPath; // 更新最终路径
        console.log(`SHP 已成功迁移为 JSON: ${newFileName}`);
    }

    // 策略 C: JSON -> 直接保存
    else {
        await fsPromises.writeFile(absolutePath, JSON.stringify(geoJsonData, null, 2), 'utf-8');
    }

    // 重新计算文件大小并更新到数据库对象
    try {
        const stats = await fsPromises.stat(finalPath);
        fileNode.size = stats.size; // 更新大小
    } catch (e) {
        console.warn('无法更新文件大小统计');
    }

    return fileNode;
};

/**
 * 更新文件 控制器
 * 控制器作用：更新文件内部数据接口
 * 对应前端: geoService.updateFileData
 * 重要修改: 根据 recordId 来修改 GeoJSON 中的 properties 并写回硬盘，防止行顺序改变导致的一些问题
 */
export const updateFileData = async (req: Request, res: Response) => {
  try {
    // req.params.id是例如 http://localhost:3000/api/files/65a1.../update 中的id
    const fileId = req.params.id;
    // 从请求体中获取 recordId 和 data (修改后的行数据)
    const { recordId, data } = req.body; 

    console.log(`[Update] 收到更新请求 - 文件ID: ${fileId}, 记录ID: ${recordId}`);

    // 1. 数据库校验
    const dbNode = await FileNode.findById(fileId);
    if (!dbNode || !dbNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });

    let fileNode = dbNode;
    if (fileNode.type === 'folder' || !fileNode.path) {
      return res.status(400).json({ code: 400, message: '无法编辑文件夹，请选择具体文件/文件路径不存在' });
    }
    // process.cwd()是终端输入命令的那个文件夹路径
    const absolutePath = path.resolve(process.cwd(), fileNode.path);
    // 读取并解析文件
    const { type, data: fileData } = await readAndParseFile(absolutePath, fileNode.extension);

    // 2. 情况A: GeoJSON (FeatureCollection)
    if (type === 'json' && fileData.type === 'FeatureCollection' && Array.isArray(fileData.features)) {
        // 使用 == (弱等于) 进行比较
        // 防止前端传的是 string "3207"，而文件里存的是 number 3207，导致找不到
        const targetIndex = fileData.features.findIndex((f: any) => 
            f.properties?.id == recordId || f.id == recordId
        );

        if (targetIndex === -1) {
             console.warn(`[Update] 未找到记录。请求ID: ${recordId} (类型: ${typeof recordId})`);
             return res.status(404).json({ code: 404, message: `未找到指定 ID 的行数据 (ID: ${recordId})` });
        }

        const targetFeature = fileData.features[targetIndex];
        
        // 更新属性 (保留原有的 geometry 和其他未修改的属性)
        // 更新的逻辑：对象展开运算符 (...) 有一个非常重要的特性：“后来居上”（Last One Wins）
        // 当你在一个新对象里展开多个对象时，如果出现了相同的 key（键名），写在后面的会覆盖写在前面的。
        targetFeature.properties = { ...targetFeature.properties, ...data };
        
        // 清理 DataPivot 前端组件临时添加的辅助字段，防止写入文件
        ['cp', '_cp', '_geometry', '_lng', '_lat', '_geom_coords'].forEach(k => delete targetFeature.properties[k]);

        // 智能保存 (处理 CSV 和 SHP 的写回逻辑)
        fileNode = await saveDataSmart(fileNode, fileData);
        
        // 更新数据库的时间戳
        // 告诉 MongoosefileNode 这个对象里的 updatedAt（更新时间）字段已经被修改了
        // 要不然数据库有时候觉得属性没变，它为了省事，根本不会向数据库发送保存请求
        fileNode.markModified('updatedAt'); 
        await fileNode.save(); 

        return res.status(200).json({ code: 200, message: '保存成功', data: { updatedAt: fileNode.updatedAt } });
    } 

    // 3. 情况B: 普通数组 (纯 JSON 数组 或 CSV 解析后的结果)
    if (type === 'json' && Array.isArray(fileData)) {
        // 同样使用弱等于
        const targetIndex = fileData.findIndex((row: any) => row.id == recordId);

        if (targetIndex === -1) {
             console.warn(`[Update] 未找到记录。请求ID: ${recordId}`);
             return res.status(404).json({ code: 404, message: `未找到指定 ID 的行数据 (ID: ${recordId})` });
        }
        
        // 更新数据
        fileData[targetIndex] = { ...fileData[targetIndex], ...data };
        
        // 保存
        fileNode = await saveDataSmart(fileNode, fileData);
        // 告诉 MongoosefileNode 这个对象里的 updatedAt（更新时间）字段已经被修改了
        // 要不然数据库有时候觉得属性没变，它为了省事，根本不会向数据库发送保存请求
        fileNode.markModified('updatedAt'); 
        await fileNode.save();
        
        return res.status(200).json({ code: 200, message: '保存成功', data: { updatedAt: fileNode.updatedAt } });
    }

    // 4. 其他情况
    return res.status(400).json({ code: 400, message: '不支持的文件结构 (仅支持 GeoJSON 或 Array)' });

  } catch (error: any) {
    console.error('更新文件失败:', error);
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
        // 1. 🚨 使用 const 接收 DB 查询结果，确保类型收窄
        const dbNode = await FileNode.findById(id);
        if (!dbNode || !dbNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });
        let fileNode = dbNode;

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
            
            fileNode = await saveDataSmart(fileNode, data);
            
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

        // 1. 🚨 使用 const 接收 DB 查询结果，确保类型收窄
        const dbNode = await FileNode.findById(id);
        if (!dbNode || !dbNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });
        let fileNode = dbNode;

        if (!fileNode || !fileNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });

        const absolutePath = path.resolve(process.cwd(), fileNode.path);
        // 🚨 传入 extension
        const { type, data } = await readAndParseFile(absolutePath, fileNode.extension);

        if (type === 'json' && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
            if (rowIndex >= 0 && rowIndex < data.features.length) {
                data.features.splice(rowIndex, 1);
                fileNode = await saveDataSmart(fileNode, data);
                
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

        // 1. 🚨 使用 const 接收 DB 查询结果，确保类型收窄
        const dbNode = await FileNode.findById(id);
        if (!dbNode || !dbNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });
        let fileNode = dbNode;

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
            fileNode = await saveDataSmart(fileNode, data);
            
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

        // 1. 🚨 使用 const 接收 DB 查询结果，确保类型收窄
        const dbNode = await FileNode.findById(id);
        if (!dbNode || !dbNode.path) return res.status(404).json({ code: 404, message: '文件不存在' });
        let fileNode = dbNode;

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
            fileNode = await saveDataSmart(fileNode, data);
            
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