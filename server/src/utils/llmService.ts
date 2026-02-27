import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// 使用 OpenAI SDK 接入大模型 (DeepSeek 或 Qwen)
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com', // 或者你的阿里云 baseURL
    apiKey: process.env.DEEPSEEK_API_KEY, // 确保 .env 里有这个配置
});

// 1. 替换顶部的接口定义，增加 parameters 字段
export interface AIGeneratedModel {
    modelName: string;
    displayName: string;
    description: string;
    parameters: Array<{ name: string; type: string; description: string }>; // 🌟 新增：参数签名数组
    pythonCode: string;
}

// 2. 替换中间的 SYSTEM_PROMPT 常量
const SYSTEM_PROMPT = `
你是一位顶尖的 WebGIS 算法工程师。你的任务是根据用户的自然语言模糊需求，自动推导出合适的模型名称、提取所需参数，并编写 Python 模型脚本。

【严格的输出规范（极度重要）】
你必须且只能输出一个合法的 JSON 对象。绝对不要包含任何 Markdown 标记（例如 \`\`\`json ），绝对不要输出任何多余的解释性文字！
JSON 的结构必须严格如下：
{
  "modelName": "推导出的模型英文名，全大写字母，用下划线分隔，如 BUFFER_AREA",
  "displayName": "推导出的模型中文名，如 缓冲区面积计算",
  "description": "对算法逻辑的简短中文描述，不超过50个字",
  "parameters": [
      { "name": "参数1", "type": "number", "description": "参数1的作用说明" }
  ],
  "pythonCode": "完整的纯 Python 代码字符串，注意代码内部的换行符转义 (\\n)"
}

【Python 代码编写核心架构逻辑（必读！！！）】
1. 必须且只能包含一个主执行函数：\`def execute(df, parameters):\`
2. \`df\`: 代表前端传来的表格数据 (Pandas DataFrame 或 GeoDataFrame)。
   ★ 重点注意：如果用户需求涉及属性列计算，请严格通过索引提取列数据，如 \`col1 = df.iloc[:, 0]\`。不要依赖列名！
3. \`parameters\`: 这是一个字典，目前运行期为空 \`{}\`。绝对不要从这里读取列名！
4. 【🌟 空间计算能力开放（极其重要）】：
   传入的 \`df\` 已经是一个 GeoPandas 的 GeoDataFrame 对象（自带 'geometry' 列，坐标系为 EPSG:4326）。
   传入的 df 是一个 GeoPandas 的 GeoDataFrame 对象。
   你现在不仅可以使用 geopandas 和 shapely 进行拓扑计算，还可以直接调用 pysal 进行空间统计分析（如莫兰指数、空间权重），以及调用 scikit-learn 和 scipy 进行聚类与机器学习建模
   **警告**：EPSG:4326 的单位是度(degree)。如果你要计算“面积 (Area)”或做“米级缓冲区 (Buffer)”，请务必在代码中先将 df 转换到投影坐标系（例如 EPSG:3857，投影坐标系按照用户上传的数据来确定，单位是米），计算完成后无需转回。
   【示例：计算每个要素 500 米缓冲区的面积】：
   projected_df = df.to_crs(epsg=3857)
   result = projected_df.geometry.buffer(500).area
5. 返回值必须是一个一维的 Python List，长度与 df 的行数完全一致。

【代码模板参考】：
import pandas as pd
import numpy as np
import geopandas as gpd

def execute(df, parameters):
    try:
        # 如果是空间计算，示例：
        projected_df = df.to_crs(epsg=3857)
        result = projected_df.geometry.area
        return result.tolist()
    except Exception as e:
        raise ValueError(f"模型计算出错: {str(e)}")
`;

/**
 * 调度大模型生成结构化模型数据
 */
export const generateModelCodeFromAI = async (userPrompt: string): Promise<AIGeneratedModel> => {
    try {
        const response = await openai.chat.completions.create({
            model: "deepseek-coder", // 或你的阿里模型名
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `请根据以下需求设计并编写模型：\n${userPrompt}` }
            ],
            temperature: 0.1, // 极低的温度，保证 JSON 格式的稳定性
            max_tokens: 2500,
        });

        let rawContent = response.choices[0].message.content || "{}";
        
        // 🌟 防御性编程：清洗可能出现的 Markdown 标记
        rawContent = rawContent.trim();
        if (rawContent.startsWith("```json")) {
            rawContent = rawContent.replace(/^```json\n?/, "");
        }
        if (rawContent.startsWith("```")) {
            rawContent = rawContent.replace(/^```\n?/, "");
        }
        if (rawContent.endsWith("```")) {
            rawContent = rawContent.replace(/\n?```$/, "");
        }

        // 解析大模型返回的 JSON
        const parsedData = JSON.parse(rawContent.trim()) as AIGeneratedModel;
        
        if (!parsedData.modelName || !parsedData.pythonCode) {
            throw new Error("AI 返回的数据结构缺失关键字段");
        }

        return parsedData;

    } catch (error: any) {
        console.error("调用大模型 API 解析失败:", error);
        throw new Error("AI 智能体未能生成合法的模型代码，请调整指令语后重试。");
    }
};