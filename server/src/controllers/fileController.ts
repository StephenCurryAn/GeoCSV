import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
// 因为 Multer 存硬盘的代码和控制器处理数据的代码，
// 不在同一个文件里面，所以不好将路径这个参数传递，只好通过 req 的方式，所以需要req
// Multer存到硬盘之后，但是控制器还不知道这个文件路径是什么，所以需要req
// 先进行Multer存硬盘这个步骤，然后进行控制器处理数据这个步骤，并返回回复

/**
 * 文件上传控制器
 * 处理客户端上传的文件并将其解析为 GeoJSON 对象
 */
export const uploadFile = async (req: Request, res: Response) => {
    try {
        // 检查是否有文件被上传
        if (!req.file) {
            return res.status(400).json({
                code: 400,
                message: '没有文件被上传',
                data: null
            });
        }

        // 获取上传文件的完整路径
        const filePath = req.file.path;

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                code: 404,
                message: '上传的文件未找到',
                data: null
            });
        }

        // 根据文件扩展名决定如何处理文件内容
        const fileExtension = path.extname(req.file.originalname).toLowerCase();

        let parsedData: any;

        // 读取文件内容
        const fileContent = fs.readFileSync(filePath, 'utf8');

        // 根据文件类型进行不同的解析处理
        if (fileExtension === '.csv') {
            // 如果是 CSV 文件，需要先转换为 JSON 再进一步处理为 GeoJSON
            // 这里暂时返回原始内容，实际应用中需要 CSV 到 GeoJSON 的转换逻辑
            parsedData = {
                type: 'FeatureCollection',
                features: []
            };
            console.warn('CSV to GeoJSON conversion not implemented yet.');
        } else if (fileExtension === '.shp') {
            // Shapefile 需要特殊处理，通常需要额外的库如 shapefile-js
            // 这里暂时返回空的 FeatureCollection
            parsedData = {
                type: 'FeatureCollection',
                features: []
            };
            console.warn('Shapefile processing not implemented yet.');
        } else {
            // 对于 JSON/GEOJSON 文件，直接解析
            parsedData = JSON.parse(fileContent);
        }

        // 成功响应
        // 这里要和前端的 geoService.ts 中的 UploadResponse 接口对应
        res.status(200).json({
            code: 200,
            message: '文件上传并解析成功',
            data: {
                filename: req.file.originalname,  // 返回原始文件名
                geoJson: parsedData,         // 返回解析后的 GeoJSON 数据
                fileSize: req.file.size, // 文件大小
                fileType: fileExtension // 文件类型
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