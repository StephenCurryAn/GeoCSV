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
  "modelName": "推导出的模型英文名，全大写字母，用下划线分隔，如 WATER_RISK_INDEX",
  "displayName": "推导出的模型中文名，如 洪涝风险指数",
  "description": "对算法逻辑的简短中文描述，不超过50个字",
  "parameters": [
      { "name": "参数1", "type": "number", "description": "参数1的作用说明" },
      { "name": "参数2", "type": "number", "description": "参数2的作用说明" }
  ],
  "pythonCode": "完整的纯 Python 代码字符串，注意代码内部的换行符转义 (\\n)"
}

【Python 代码编写核心架构逻辑（必读！！！）】
1. 必须且只能包含一个主执行函数：\`def execute(df, parameters):\`
2. \`df\`: 代表前端传来的表格数据 (Pandas DataFrame)。
   ★ 重点注意：前端用户在表格输入公式如 \`=WATER_RISK(降雨量列, 高程列)\` 时，系统会自动将这两列数据提取并组成 df 发给 Python。
   ★ 因此，传入的 \`df\` 的列顺序，严格对应用户输入公式时的参数顺序！
   ★ 在代码中提取数据时，绝对不要依赖列名，必须通过索引位置提取列数据！
     示例：
     col1_data = df.iloc[:, 0]  # 获取第一个输入列的数据
     col2_data = df.iloc[:, 1]  # 获取第二个输入列的数据
3. \`parameters\`: 这是一个字典，目前运行期为空 \`{}\`。绝对不要从这里读取列名！
4. 返回值必须是一个一维的 Python List，长度与 df 的行数完全一致。
5. 必须包含充分的异常处理，处理缺失值或非数字时，请使用 \`pd.to_numeric(..., errors='coerce').fillna(0)\` 以防止崩溃。

【代码模板参考】：
import pandas as pd
import numpy as np

def execute(df, parameters):
    try:
        # 1. 按顺序提取列数据（严格使用 iloc）
        # 假设模型需要两个参数
        col1 = pd.to_numeric(df.iloc[:, 0], errors='coerce').fillna(0)
        col2 = pd.to_numeric(df.iloc[:, 1], errors='coerce').fillna(0)
        
        # 2. 执行核心算法逻辑
        result = (col1 * 0.4) + (col2 * 0.6)
        
        # 3. 返回 List
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