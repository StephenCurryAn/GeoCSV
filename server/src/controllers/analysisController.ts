import { Request, Response } from 'express';
import Feature from '../models/Feature';
import mongoose from 'mongoose';

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