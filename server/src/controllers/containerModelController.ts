import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ModelRegistry from '../models/ModelRegistry';

const BASE_IMAGE_MAP = {
    'lite': 'geo-base:lite',       
    'spatial': 'geo-base:spatial', 
    'water': 'geo-base:water'      
};

export const uploadAndBuildContainerModel = async (req: Request, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传标准的模型 ZIP 包' });

        const zipPath = req.file.path;
        const extractDir = path.join(process.cwd(), 'uploads', 'models_temp', `model_${Date.now()}`);
        
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractDir, true);

        const schemaPath = path.join(extractDir, 'Meta-Schema.json');
        if (!fs.existsSync(schemaPath)) {
            return res.status(400).json({ error: 'ZIP 包中缺少核心契约文件: Meta-Schema.json' });
        }

        // 🌟 读取我们设计的 DOM 树契约
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const { modelName, displayName, description, baseEnv, entrypoint, domTree } = schema;

        const baseImage = BASE_IMAGE_MAP[baseEnv as keyof typeof BASE_IMAGE_MAP] || BASE_IMAGE_MAP['lite'];
        
        // 🌟 动态生成轻量级 Dockerfile
        const dockerfileContent = `
        FROM ${baseImage}
        WORKDIR /app
        COPY . /app
        RUN if [ -f "requirements.txt" ]; then pip3 install --no-cache-dir -r requirements.txt; fi
        CMD ["python3", "${entrypoint}"]
        `;
        fs.writeFileSync(path.join(extractDir, 'Dockerfile'), dockerfileContent);

        const targetImageName = `geocsv/model-${modelName.toLowerCase()}:latest`;

        // 落库，状态设定为 building
        const newModel = await ModelRegistry.findOneAndUpdate(
            { modelName: modelName.toUpperCase() },
            {
                modelName: modelName.toUpperCase(),
                displayName,
                description,
                type: 'container', // 显式声明为容器
                containerMeta: { baseEnv, entrypoint, imageName: targetImageName, domTree },
                status: 'building'
            },
            { upsert: true, new: true }
        );

        // 异步非阻塞执行 Docker Build
        const buildProcess = spawn('docker', ['build', '-t', targetImageName, '.'], { cwd: extractDir });

        buildProcess.stdout.on('data', (data) => console.log(`[Docker Build] ${data}`));
        buildProcess.on('close', async (code) => {
            if (code === 0) {
                console.log(`🚀 模型 ${modelName} 镜像构建成功！`);
                await ModelRegistry.findByIdAndUpdate(newModel._id, { status: 'active' });
            } else {
                console.error(`❌ 模型 ${modelName} 构建失败`);
                await ModelRegistry.findByIdAndUpdate(newModel._id, { status: 'failed' });
            }
        });

        res.json({ code: 200, message: `模型契约已解析，正在后台轻量化构建...`, data: newModel });

    } catch (error: any) {
        console.error("容器装配失败:", error);
        res.status(500).json({ error: '模型装配失败: ' + error.message });
    }
};