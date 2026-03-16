// server/src/controllers/modelExecutionController.ts
import { Request, Response } from 'express';
import ModelRegistry from '../models/ModelRegistry';
import Feature from '../models/Feature';
import FileNode from '../models/FileNode'; // 🌟 引入文件树模型，用于产物入库
import { generateBehaviorScript } from '../utils/llmService';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export const executeContainerModelLogic = async (
    res: Response, 
    modelDef: any, 
    fileId: string, 
    reqColumns: string[], 
    reqParams: Record<string, any>
) => {
    try {
        const inputNode = modelDef.containerMeta.domTree.inputs[0]; 
        const targetFormat = inputNode.format; 

        // ==========================================
        // 🌟 性能优化 1：只取 1 条探查 Schema (防 OOM)
        // ==========================================
        console.log(`[DOM 装配] 正在提取图层元数据 (Schema)...`);
        const sampleFeature = await Feature.findOne({ fileId }).lean();
        if(!sampleFeature) {
            return res.status(400).json({ error: '底层数据源为空，无法执行模型' });
        }
        
        const allAvailableColumns = Object.keys((sampleFeature as any).properties || {});
        const userFileName = `raw_dataset.geojson`; 

        // ==========================================
        // 🌟 AI 唤醒：即时编译多粒度行为脚本
        // ==========================================
        const behaviorScriptCode = await generateBehaviorScript(
            userFileName, allAvailableColumns, reqColumns, reqParams, targetFormat, inputNode.description, inputNode.expectedSchema
        );

        // ==========================================
        // 🌟 物理沙箱初始化
        // ==========================================
        const runId = `job_${Date.now()}`;
        const jobDir = path.join(process.cwd(), 'jobs', runId);
        const inputDir = path.join(jobDir, 'input');
        const outputDir = path.join(jobDir, 'output');
        fs.mkdirSync(inputDir, { recursive: true });
        fs.mkdirSync(outputDir, { recursive: true });

        fs.writeFileSync(path.join(inputDir, 'params.json'), JSON.stringify(reqParams));
        const scriptPath = path.join(jobDir, 'dynamic_adapter.py');
        fs.writeFileSync(scriptPath, behaviorScriptCode);

        // ==========================================
        // 🌟 性能优化 2：游标流式写入全量 GeoJSON (Streaming)
        // ==========================================
        console.log(`[DOM 装配] 正在流式导出全量空间数据至沙箱...`);
        const geojsonFilePath = path.join(inputDir, userFileName);
        const writeStream = fs.createWriteStream(geojsonFilePath, { encoding: 'utf8' });
        
        writeStream.write('{"type":"FeatureCollection","features":[\n');
        const cursor = Feature.find({ fileId }).lean().cursor();
        let isFirst = true;
        let featureCount = 0;

        for await (const doc of cursor) {
            const featureStr = JSON.stringify({
                type: "Feature",
                geometry: (doc as any).geometry,
                properties: (doc as any).properties
            });
            if (!isFirst) writeStream.write(',\n');
            writeStream.write(featureStr);
            isFirst = false;
            featureCount++;
        }
        writeStream.write('\n]}');
        writeStream.end();

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        console.log(`[DOM 装配] 成功流式导出 ${featureCount} 条空间要素，准备启动 Docker...`);

        // ==========================================
        // 🌟 沙箱执行流水线
        // ==========================================
        const dockerCmdArgs = [
            'run', '--rm', 
            '-v', `${inputDir}:/data/input`,   
            '-v', `${outputDir}:/data/output`, 
            '-v', `${scriptPath}:/app/dynamic_adapter.py`, 
            modelDef.containerMeta.imageName, 
            'bash', '-c', 
            `python3 /app/dynamic_adapter.py && python3 ${modelDef.containerMeta.entrypoint}` 
        ];

        const dockerProcess = spawn('docker', dockerCmdArgs);

        dockerProcess.stdout.on('data', (data) => console.log(`[Container] ${data}`));
        dockerProcess.stderr.on('data', (data) => console.error(`[Container Error] ${data}`));

        // ==========================================
        // 🌟 数据闭环：自动抓取产物并入库
        // ==========================================
        dockerProcess.on('close', async (code) => {
            if (code === 0) {
                console.log(`✅ [沙箱] 容器模型执行成功！准备回流产物...`);
                try {
                    const outputFiles = fs.readdirSync(outputDir);
                    if (outputFiles.length > 0) {
                        const resultFileName = outputFiles[0]; // 抓取核心产物
                        const resultFilePath = path.join(outputDir, resultFileName);
                        
                        // 移动到项目的 uploads 公共目录
                        const targetDir = path.join(process.cwd(), 'uploads');
                        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);
                        const finalPath = path.join(targetDir, `model_out_${Date.now()}_${resultFileName}`);
                        fs.copyFileSync(resultFilePath, finalPath);
                        
                        // 获取文件大小信息（因为你的 Schema 要求 type='file' 时 size 必填）
                        const fileStat = fs.statSync(finalPath);
                        // 🌟 自动入库到系统的文件资源树
                        const newFileNode = await FileNode.create({
                            name: `[${modelDef.displayName} 产物] ${resultFileName}`, // 必须叫 name
                            type: 'file',                                              // 必须严格为 'file'
                            path: finalPath,                                           // 必须叫 path
                            size: fileStat.size,                                       // 必须提供 size
                            parentId: null,
                        });

                        res.json({ 
                            code: 200, 
                            type: 'global_file', // 🌟 关键标识：告诉前端这是全局文件产物
                            message: `空间建模执行成功，生成产物已入库`, 
                            jobRunId: runId,
                            newFileId: newFileNode._id,
                            newFileName: newFileNode.name
                        });
                    } else {
                        res.json({ code: 200, type: 'empty', message: '执行成功，但未产生结果文件', jobRunId: runId });
                    }
                } catch (ioErr) {
                    res.status(500).json({ error: '提取沙箱产物失败' });
                }
            } else {
                res.status(500).json({ error: '沙箱运行崩溃，请检查参数或依赖' });
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const executeContainerModel = async (req: Request, res: Response) => {
    const { fileId, modelName, rawArgs } = req.body;
    const modelDef = await ModelRegistry.findOne({ modelName: modelName.toUpperCase() });
    if (!modelDef || modelDef.type !== 'container') return res.status(400).json({ error: '无效的容器模型' });
    
    return executeContainerModelLogic(res, modelDef, fileId, [], { rawArgs });
};