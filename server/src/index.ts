// server/src/server.ts
import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = 3000;

// 1. 中间件配置
app.use(cors()); // 允许前端跨域访问
app.use(express.json()); // 解析 JSON 请求体

// 2. 测试路由
app.get('/api/health', (req: Request, res: Response) => {
    res.json({ 
        status: 'success', 
        message: 'WebGIS Backend is running!',
        timestamp: new Date()
    });
});

// 3. 启动服务
app.listen(PORT, () => {
    console.log(`
    🚀 服务启动成功!
    ---------------------------
    本地地址: http://localhost:${PORT}
    测试接口: http://localhost:${PORT}/api/health
    ---------------------------
    `);
});