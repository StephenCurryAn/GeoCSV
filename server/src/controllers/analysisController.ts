import { Request, Response } from 'express';
import Feature from '../models/Feature';
import mongoose from 'mongoose';
import * as turf from '@turf/turf';

// 简易空间索引
class SimpleGridIndex {
    private buckets: Map<string, any[]> = new Map();
    private cellSize: number;

    constructor(bbox: number[], resolution: number = 20) { // 稍微调大 resolution 提高精度
        const width = bbox[2] - bbox[0];
        const height = bbox[3] - bbox[1];
        this.cellSize = Math.max(width, height) / resolution;
    }

    insert(item: any) {
        const bbox = turf.bbox(item);
        const minX = Math.floor(bbox[0] / this.cellSize);
        const maxX = Math.floor(bbox[2] / this.cellSize);
        const minY = Math.floor(bbox[1] / this.cellSize);
        const maxY = Math.floor(bbox[3] / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = `${x},${y}`;
                if (!this.buckets.has(key)) this.buckets.set(key, []);
                this.buckets.get(key)!.push(item);
            }
        }
    }

    query(feature: any): any[] {
        const bbox = turf.bbox(feature);
        return this.queryByBbox(bbox);
    }

    // ✅ [新增] 支持直接通过 bbox 查询，方便做邻域搜索
    queryByBbox(bbox: number[]): any[] {
        const candidates = new Set<any>();
        const minX = Math.floor(bbox[0] / this.cellSize);
        const maxX = Math.floor(bbox[2] / this.cellSize);
        const minY = Math.floor(bbox[1] / this.cellSize);
        const maxY = Math.floor(bbox[3] / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const key = `${x},${y}`;
                const items = this.buckets.get(key);
                if (items) items.forEach(item => candidates.add(item));
            }
        }
        return Array.from(candidates);
    }
}

function safeIntersect(poly1: any, poly2: any): any {
    try {
        // @ts-ignore
        let intersection = turf.intersect(poly1, poly2);
        if (!intersection) {
             // @ts-ignore
             intersection = turf.intersect(turf.featureCollection([poly1, poly2]));
        }
        return intersection;
    } catch (e) {
        try {
            // @ts-ignore
            return turf.intersect(turf.featureCollection([poly1, poly2]));
        } catch (e2) {
            return null;
        }
    }
}

export const pivotAnalysis = async (req: Request, res: Response) => {
    try {
        const { 
            fileId, 
            groupByRow,   // 行分组 (必填) e.g. "properties.District"
            groupByCol,   // 列分组 (选填) e.g. "properties.Year"
            valueField,   // 统计值 (必填) e.g. "properties.Rainfall"
            method        // "sum", "avg", "max", "min", "count"
        } = req.body;

        if (!fileId || !groupByRow) {
            return res.status(400).json({ message: 'Missing required parameters' });
        }

        // 1. 构建聚合累加器
        let accumulator: any = {};
        if (method === 'count') {
            accumulator = { $sum: 1 };
        } else {
            // 注意：前端传来的只是字段名 "Rainfall"，Mongo需要 "$properties.Rainfall"
            // 为了稳健，我们这里做一个简单的处理，如果前端没传 properties. 前缀，我们帮它加上
            const vField = valueField.startsWith('properties.') ? valueField : `properties.${valueField}`;
            const fieldPath = `$${vField}`;
            
            switch (method) {
                case 'sum': accumulator = { $sum: fieldPath }; break;
                case 'avg': accumulator = { $avg: fieldPath }; break;
                case 'max': accumulator = { $max: fieldPath }; break;
                case 'min': accumulator = { $min: fieldPath }; break;
                default: accumulator = { $sum: fieldPath };
            }
        }

        const rField = groupByRow.startsWith('properties.') ? groupByRow : `properties.${groupByRow}`;
        const cField = groupByCol && !groupByCol.startsWith('properties.') ? `properties.${groupByCol}` : groupByCol;

        const pipeline: any[] = [
            { $match: { fileId: new mongoose.Types.ObjectId(fileId) } }
        ];

        // 2. 区分 1D 还是 2D 分析
        if (!cField) {
            // --- 模式 A: 简单一维分组 ---
            pipeline.push({
                $group: {
                    _id: `$${rField}`,
                    value: accumulator
                }
            });
            pipeline.push({ $sort: { value: -1 } }); // 默认降序
        } else {
            // --- 模式 B: 二维透视 (行转列) ---
            // 第一步：联合分组 (Row + Col)
            pipeline.push({
                $group: {
                    _id: {
                        row: `$${rField}`,
                        col: `$${cField}`
                    },
                    val: accumulator
                }
            });
        }

        const rawResults = await Feature.aggregate(pipeline);

        // 3. 数据后处理 (格式化)
        let finalData: any[] = [];
        let dynamicColumns: string[] = [];

        if (!cField) {
            // 1D 格式化
            finalData = rawResults.map((item, idx) => ({
                key: idx, // React 需要 key
                rowKey: item._id || '未分类', // 统一叫 rowKey 方便前端渲染
                value: typeof item.value === 'number' ? parseFloat(item.value.toFixed(2)) : item.value
            }));
            dynamicColumns = ['value'];
        } else {
            // 2D 格式化 (Matrix 转置)
            const map = new Map<string, any>();
            const colSet = new Set<string>();

            rawResults.forEach(item => {
                const rKey = item._id.row || '未分类';
                const cKey = String(item._id.col || '未分类'); // 列名必须是字符串
                const val = typeof item.val === 'number' ? parseFloat(item.val.toFixed(2)) : item.val;

                colSet.add(cKey);

                if (!map.has(rKey)) {
                    map.set(rKey, { key: rKey, rowKey: rKey });
                }
                const rowObj = map.get(rKey);
                rowObj[cKey] = val; // { rowKey: '南京', '2020': 100, '2021': 200 }
            });

            dynamicColumns = Array.from(colSet).sort(); // 列排序
            finalData = Array.from(map.values());
        }

        res.json({
            success: true,
            data: finalData,
            columns: dynamicColumns,
            meta: { groupByRow, groupByCol, valueField, method }
        });

    } catch (error) {
        console.error('Pivot error:', error);
        res.status(500).json({ message: 'Analysis failed' });
    }
};

export const generateGrid = async (req: Request, res: Response): Promise<void> => {
    try {
        const { fileId, shape, size, method, targetField } = req.body;

        if (!fileId || !shape || !size) {
            res.status(400).json({ error: 'Missing required parameters' });
            return;
        }
        
        // ✅ [配置] 定义缓冲区圈数 n (可在此处修改，或从前端传入)
        const BUFFER_RINGS = 2; // 显示周围 2 圈网格

        console.log(`[Grid] Generating ${shape} grid (${size}km) for file ${fileId}`);
        
        const rawFeatures = await Feature.find({ fileId }).lean();
        if (!rawFeatures || rawFeatures.length === 0) {
                res.status(404).json({ error: 'No features found' });
                return;
        }

        const features = rawFeatures.map((f: any) => turf.feature(f.geometry, f.properties));
        const featureCollection = turf.featureCollection(features);
        const bbox = turf.bbox(featureCollection);
        
        // 2. 生成网格
        const options: any = { units: 'kilometers' };
        let grid: any;
        try {
            if (shape === 'hex') {
                grid = turf.hexGrid(bbox, size, options);
            } else {
                grid = turf.squareGrid(bbox, size, options);
            }
        } catch (e) {
            res.status(500).json({ error: 'Grid generation error' });
            return;
        }

        // 初始化属性，并给每个网格打上唯一 ID 方便索引
        grid.features.forEach((cell: any, index: number) => {
            cell.properties = { 
                value: 0, 
                count: 0,
                _id: index // 内部临时 ID
            };
        });

        // 3. 建立索引
        const gridIndex = new SimpleGridIndex(bbox, 25);
        grid.features.forEach((cell: any) => gridIndex.insert(cell));

        // 4. 聚合计算
        // 记录所有“活跃”网格的 ID (即与数据相交的网格)
        const activeCellIds = new Set<number>();

        let processedCount = 0;
        let intersectCount = 0;

        features.forEach((feature: any) => {
            const geometryType = feature.geometry.type;
            let rawValue = 1;
            if (method !== 'count' && targetField) {
                const val = Number(feature.properties[targetField]);
                if (isNaN(val)) return;
                rawValue = val;
            }

            const candidateCells = gridIndex.query(feature);
            
            candidateCells.forEach((cell: any) => {
                let ratio = 0;
                try {
                    // A. 点数据
                    if (geometryType === 'Point') {
                        if (turf.booleanPointInPolygon(feature, cell)) ratio = 1;
                    } 
                    // B. 线数据
                    else if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
                        if (!turf.booleanIntersects(cell, feature)) return;
                        const totalLen = turf.length(feature);
                        if (totalLen === 0) return;

                        if (turf.booleanContains(cell, feature)) {
                            ratio = 1;
                        } else {
                            const cellBoundary = turf.polygonToLine(cell);
                            // @ts-ignore
                            const splitLines = turf.lineSplit(feature, cellBoundary);
                            let insideLen = 0;
                            splitLines.features.forEach((seg: any) => {
                                const len = turf.length(seg);
                                if (len > 0) {
                                    const mid = turf.along(seg, len / 2);
                                    if (turf.booleanPointInPolygon(mid, cell)) insideLen += len;
                                }
                            });
                            if (splitLines.features.length === 0) {
                                    const mid = turf.along(feature, totalLen / 2);
                                    if (turf.booleanPointInPolygon(mid, cell)) ratio = 1;
                            } else {
                                    ratio = insideLen / totalLen;
                            }
                        }
                    } 
                    // C. 面数据
                    else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
                        if (!turf.booleanIntersects(cell, feature)) return;
                        if (turf.booleanContains(cell, feature)) {
                            ratio = 1; 
                        } else if (turf.booleanContains(feature, cell)) {
                            const cellArea = turf.area(cell);
                            const featArea = turf.area(feature);
                            if (featArea > 0) ratio = cellArea / featArea;
                        } else {
                            const intersection = safeIntersect(cell, feature);
                            if (intersection) {
                                const totalArea = turf.area(feature);
                                const partArea = turf.area(intersection);
                                if (totalArea > 0) ratio = partArea / totalArea;
                            }
                        }
                    }

                    if (ratio > 0) {
                        cell.properties.value += rawValue * ratio;
                        cell.properties.count += 1;
                        intersectCount++;
                        // ✅ [标记] 该网格是活跃的
                        activeCellIds.add(cell.properties._id);
                    }
                } catch (err) {}
            });
            processedCount++;
        });

        console.log(`[Grid] Processed ${processedCount} features. Active cells: ${activeCellIds.size}`);

        // 5. 修约数值
        grid.features.forEach((cell: any) => {
            cell.properties.value = Number(cell.properties.value.toFixed(2));
        });

        // ✅ [新增] 缓冲区过滤逻辑
        // 无论点、线、面，都执行这个通用的视觉优化
        if (activeCellIds.size > 0) {
            const cellsToKeep = new Set<number>(activeCellIds);
            
            // 将所有活跃网格对象找出来
            const activeCells = grid.features.filter((f: any) => activeCellIds.has(f.properties._id));
            
            // 计算缓冲区半径 (km)
            // 假设 size 是半径或边长，我们向外扩展 n * size * 2 (确保覆盖够宽)
            // 这里用一个近似值：size * 1.5 * n
            const bufferDist = size * 1.5 * BUFFER_RINGS;

            // 对每个活跃网格，寻找其周边的邻居
            activeCells.forEach((cell: any) => {
                const cellBbox = turf.bbox(cell);
                // 扩大 BBox
                const expandedBbox = [
                    cellBbox[0] - 0.02 * size * BUFFER_RINGS, // 经度简易换算
                    cellBbox[1] - 0.02 * size * BUFFER_RINGS, // 纬度简易换算
                    cellBbox[2] + 0.02 * size * BUFFER_RINGS,
                    cellBbox[3] + 0.02 * size * BUFFER_RINGS
                ];
                
                // 利用 turf.buffer 更精确 (但这比较慢)，或者直接用 GridIndex 查邻居 (极快)
                // 这里我们用 GridIndex + 几何中心距离判断
                const center = turf.centroid(cell);
                // 搜索范围略大于缓冲区
                const neighbors = gridIndex.queryByBbox(expandedBbox);
                
                neighbors.forEach((neighbor: any) => {
                    if (cellsToKeep.has(neighbor.properties._id)) return;
                    
                    // 计算距离，判断是否在 n 圈内
                    const dist = turf.distance(center, turf.centroid(neighbor), { units: 'kilometers' });
                    // 两个相邻六边形中心距离约为 size * 1.732
                    // n 圈大约是 n * 2 * size
                    if (dist <= size * 2.0 * BUFFER_RINGS) {
                        cellsToKeep.add(neighbor.properties._id);
                    }
                });
            });

            console.log(`[Grid Filter] Buffer expansion (${BUFFER_RINGS} rings): ${activeCellIds.size} -> ${cellsToKeep.size} cells`);
            
            // 执行过滤
            grid.features = grid.features.filter((f: any) => cellsToKeep.has(f.properties._id));
        } else {
            // 如果没有任何相交，返回空
            grid.features = [];
        }

        // 清理临时 ID
        grid.features.forEach((f: any) => delete f.properties._id);

        res.json({ success: true, data: grid });

    } catch (error) {
        console.error('Grid generation failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// 辅助函数：确保 Key 生成逻辑在“初始化阶段”和“聚合阶段”完全一致
const getSafeKey = (field: string, val: any) => {
    const strVal = String(val); // 强制转字符串
    const safeVal = strVal.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
    return `${field}_${safeVal}`;
};

export const exportGrid = async (req: Request, res: Response): Promise<void> => {
    try {
        // ✅ [修改] 接收 categoryFields 数组
        const { fileId, shape, size, method, categoryFields } = req.body;

        if (!fileId || !shape || !size) {
            res.status(400).json({ error: 'Missing required parameters' });
            return;
        }

        // 兼容性处理：如果前端发来的是单选的老数据（虽然改了前端应该不会，但为了健壮性）
        const selectedCategories: string[] = Array.isArray(categoryFields) 
            ? categoryFields 
            : (categoryFields ? [categoryFields] : []);

        console.log(`[Export] Exporting ${shape} grid (${size}km) for file ${fileId}. Categories: ${selectedCategories.join(', ') || 'None'}`);

        // ✅ [Helper] 定义安全的 Key 生成函数
        const getSafeKey = (field: string, val: any) => {
            const strVal = String(val);
            const safeVal = strVal.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
            return `${field}_${safeVal}`;
        };

        // 1. 获取原始数据
        const rawFeatures = await Feature.find({ fileId }).lean();
        if (!rawFeatures || rawFeatures.length === 0) {
                res.status(404).json({ error: 'No features found' });
                return;
        }

        // 2. 识别字段 & 收集分类值
        const numericFields = new Set<string>();
        // ✅ [修改] 使用 Map 存储每个字段对应的唯一值集合: Map<FieldName, Set<Value>>
        const categoryValueMap = new Map<string, Set<string>>();

        // 初始化 Map
        selectedCategories.forEach(field => categoryValueMap.set(field, new Set()));

        rawFeatures.forEach((f: any) => {
            if (f.properties) {
                Object.keys(f.properties).forEach(key => {
                    if (typeof f.properties[key] === 'number') {
                        numericFields.add(key);
                    }
                });
                // ✅ [修改] 扫描所有选中的分类字段
                selectedCategories.forEach(field => {
                    const val = f.properties[field];
                    if (val !== undefined && val !== null) {
                        categoryValueMap.get(field)?.add(String(val));
                    }
                });
            }
        });

        const fieldsToAggregate = Array.from(numericFields);
        // 预处理所有需要生成的 Column Keys，以提高后续性能
        const allCategoryColumns: string[] = [];
        categoryValueMap.forEach((values, field) => {
            Array.from(values).sort().forEach(val => {
                allCategoryColumns.push(getSafeKey(field, val));
            });
        });

        console.log(`[Export] Numeric: ${fieldsToAggregate.length}, Category Cols to generate: ${allCategoryColumns.length}`);

        // 3. 准备网格
        const features = rawFeatures.map((f: any) => turf.feature(f.geometry, f.properties));
        const featureCollection = turf.featureCollection(features);
        const bbox = turf.bbox(featureCollection);
        
        const options: any = { units: 'kilometers' };
        let grid: any;
        try {
            if (shape === 'hex') {
                grid = turf.hexGrid(bbox, size, options);
            } else {
                grid = turf.squareGrid(bbox, size, options);
            }
        } catch (e) {
            res.status(500).json({ error: 'Grid generation error' });
            return;
        }

        // 初始化网格属性
        grid.features.forEach((cell: any) => {
            const props: any = { count: 0, _weight: 0 };
            
            // A. 常规数值
            fieldsToAggregate.forEach(field => {
                props[field] = (method === 'max' || method === 'min') 
                    ? (method === 'max' ? -Infinity : Infinity) 
                    : 0;
            });

            // ✅ [修改] B. 批量初始化所有分类列
            allCategoryColumns.forEach(key => {
                props[key] = 0;
            });

            cell.properties = props;
        });

        // 4. 建立索引 & 聚合
        const gridIndex = new SimpleGridIndex(bbox, 25);
        grid.features.forEach((cell: any) => gridIndex.insert(cell));

        features.forEach((feature: any) => {
            const geometryType = feature.geometry.type;
            const candidateCells = gridIndex.query(feature);

            // ✅ [修改] 预先计算当前要素在所有选中字段下的 Key
            // 结果形如: ['LandUse_Res', 'RoadType_HighWay']
            const activeCategoryKeys: string[] = [];
            selectedCategories.forEach(field => {
                const rawCat = feature.properties[field];
                if (rawCat !== undefined && rawCat !== null) {
                    activeCategoryKeys.push(getSafeKey(field, rawCat));
                }
            });

            candidateCells.forEach((cell: any) => {
                let ratio = 0;
                try {
                    // --- 几何计算 (保持原有逻辑) ---
                    if (geometryType === 'Point') {
                        if (turf.booleanPointInPolygon(feature, cell)) ratio = 1;
                    } 
                    else if (geometryType.includes('Line')) {
                        if (turf.booleanIntersects(cell, feature)) {
                            const totalLen = turf.length(feature);
                            if (totalLen > 0) {
                                    if (turf.booleanContains(cell, feature)) ratio = 1;
                                    else ratio = 0.5; // 请务必换回你的完整 split 逻辑
                            }
                        }
                    }
                    else if (geometryType.includes('Polygon')) {
                            if (turf.booleanIntersects(cell, feature)) {
                                const intersect = safeIntersect(cell, feature);
                                if (intersect) ratio = turf.area(intersect) / turf.area(feature);
                            }
                    }
                    // ------------------------------

                    if (ratio > 0) {
                        cell.properties.count += 1;
                        cell.properties._weight += ratio;

                        // 1. 常规聚合
                        fieldsToAggregate.forEach(field => {
                            const val = Number(feature.properties[field]);
                            if (!isNaN(val)) {
                                if (method === 'sum' || method === 'avg') cell.properties[field] += val * ratio;
                                else if (method === 'max') cell.properties[field] = Math.max(cell.properties[field], val);
                                else if (method === 'min') cell.properties[field] = Math.min(cell.properties[field], val);
                            }
                        });

                        // ✅ [修改] 2. 多分类拆分聚合
                        // 遍历当前要素拥有的所有分类 Key，分别累加
                        activeCategoryKeys.forEach(key => {
                            // 容错：确保 Key 存在
                            if (typeof cell.properties[key] === 'undefined') cell.properties[key] = 0;
                            cell.properties[key] += ratio;
                        });
                    }
                } catch (e) {}
            });
        });

        // 5. 后处理
        const resultFeatures = grid.features.filter((f: any) => f.properties.count > 0);
        
        resultFeatures.forEach((cell: any) => {
            // 常规字段修约
            fieldsToAggregate.forEach(field => {
                if (method === 'avg' && cell.properties._weight > 0) {
                    cell.properties[field] = Number((cell.properties[field] / cell.properties._weight).toFixed(2));
                } else if (method !== 'count') {
                    if (cell.properties[field] !== Infinity && cell.properties[field] !== -Infinity) {
                            cell.properties[field] = Number(cell.properties[field].toFixed(2));
                    } else {
                            cell.properties[field] = 0;
                    }
                }
            });
            
            // ✅ [修改] 分类字段修约 (批量处理所有生成的列)
            allCategoryColumns.forEach(key => {
                if (typeof cell.properties[key] !== 'undefined') {
                    cell.properties[key] = Number(cell.properties[key].toFixed(3));
                }
            });
            
            delete cell.properties._weight;
        });

        const finalGeoJSON = turf.featureCollection(resultFeatures);

        const fileName = `grid_export_${fileId}_${Date.now()}.geojson`;
        res.setHeader('Content-Type', 'application/geo+json');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.send(JSON.stringify(finalGeoJSON));

    } catch (error) {
        console.error('Export failed:', error);
        res.status(500).json({ error: 'Export failed' });
    }
}