import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// 使用 OpenAI SDK 接入 DeepSeek
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
});

/**
 * 核心系统提示词（System Prompt）
 * 约束智能体只能输出符合我们架构规范的 Python 代码
 */
const SYSTEM_PROMPT = `
你是一位顶尖的 WebGIS 算法工程师。你的任务是根据用户的需求，编写一个用于地理属性数据分析的 Python 模型脚本。
你的代码将被动态加载到 FastAPI 微服务中执行。

【严格的格式与规范要求】
1. 只能输出纯 Python 代码，绝对不要包含任何 Markdown 标记（如 \`\`\`python ），也不要包含任何解释说明文字。
2. 必须且只能包含一个主执行函数，签名严格为：\`def execute(df, parameters):\`
3. 参数说明：
   - \`df\`: 是一个 Pandas DataFrame，代表前端传来的表格数据。
   - \`parameters\`: 是一个 Python 字典，包含用户可能传递的参数（如权重、阈值等）。
4. 返回值说明：
   - 函数必须返回一个一维的 Python List，长度必须与传入的 df 的行数完全一致（每行数据对应一个计算得分/结果）。
5. 【当前能力限制】：目前系统暂未开通空间坐标系解析，因此你的代码中 **绝对不要** 涉及任何空间几何计算（如缓冲区、相交），只能基于 \`df\` 中现有的数值列进行数学计算、统计算法或逻辑判断（例如：加权求和、标准化、AHP、聚类、指数计算等）。
6. 代码必须包含充分的异常处理（try-except），当遇到缺失值、非数字类型时，需有默认的容错机制（如填补0）。

【代码模板示例】：
import pandas as pd
import numpy as np

def execute(df, parameters):
    try:
        # 你的逻辑，例如获取列名：col1 = parameters.get('col1', df.columns[0])
        # 结果存入 result_list
        result_list = [0] * len(df)
        return result_list
    except Exception as e:
        raise ValueError(f"模型计算出错: {str(e)}")
`;

/**
 * 调度大模型生成代码的 Service 函数
 */
export const generateModelCodeFromAI = async (userPrompt: string): Promise<string> => {
    try {
        const response = await openai.chat.completions.create({
            model: "deepseek-coder", // 专门用于代码生成的模型
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `请帮我编写以下模型：${userPrompt}` }
            ],
            temperature: 0.1, // 极低的温度，保证代码生成的确定性和稳定性
            max_tokens: 2048,
        });

        const rawContent = response.choices[0].message.content || "";
        
        // 防御性编程：万一 AI 不听话加了 markdown 标记，我们在后端强行剔除
        let cleanedCode = rawContent.trim();
        if (cleanedCode.startsWith("```python")) {
            cleanedCode = cleanedCode.replace(/^```python\n/, "");
        }
        if (cleanedCode.startsWith("```")) {
            cleanedCode = cleanedCode.replace(/^```\n/, "");
        }
        if (cleanedCode.endsWith("```")) {
            cleanedCode = cleanedCode.replace(/```$/, "");
        }

        return cleanedCode.trim();
    } catch (error) {
        console.error("调用大模型 API 失败:", error);
        throw new Error("AI 智能体生成模型失败，请检查 API 秘钥或网络状态。");
    }
};