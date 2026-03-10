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
    requiredColumns?: string[]; // 🌟 新增：接收 AI 解析出的必须列名
    parameters: Array<{ name: string; type: string; description: string }>; // 🌟 新增：参数签名数组
    pythonCode: string;
}

// 2. 替换中间的 SYSTEM_PROMPT 常量
const SYSTEM_PROMPT = `
你是一位顶尖的 WebGIS 算法工程师。你的任务是根据用户的自然语言模糊需求，自动推导出合适的模型名称、提取所需参数、分析所需的数据列，并编写 Python 模型脚本。

【严格的输出规范（极度重要）】
你必须且只能输出一个合法的 JSON 对象。绝对不要包含任何 Markdown 标记（例如 \`\`\`json ），绝对不要输出任何多余的解释性文字！
JSON 的结构必须严格如下：
{
  "modelName": "推导出的模型英文名，全大写字母，用下划线分隔，如 DBSCAN_CLUSTERING",
  "displayName": "推导出的模型中文名，如 DBSCAN 空间聚类",
  "description": "对算法逻辑的简短中文描述，不超过50个字",
  "requiredColumns": ["提取到的业务属性列名", "例如: 毁坏房", "必须是精确的字符串"], 
  "parameters": [
      { "name": "参数1", "type": "number", "description": "参数1的作用说明" }
  ],
  "pythonCode": "完整的纯 Python 代码字符串，注意代码内部的换行符转义 (\\n)"
}

【Python 代码编写核心架构逻辑（必读！！！）】
1. 必须且只能包含一个主执行函数：\`def execute(df, parameters):\`
2. \`df\`: 代表底层引擎传入的 GeoDataFrame 数据。
   ★ 重点注意（数据结构与提取规范）：
   - 引擎已经根据你输出的 requiredColumns 展平了数据，并处理了空值补0。
   - 绝对不能用 \`df.iloc[:, 0]\` 盲猜列！
   - 直接通过 \`df['真实的列名']\` 提取。例如用户提到了"毁坏房"，你在 requiredColumns 里写了 ["毁坏房"]，在代码里就直接用 \`df['毁坏房']\`。
   - 必须添加容错：
     \`\`\`python
     col_name = '毁坏房' # 动态替换
     if col_name not in df.columns:
         raise ValueError(f"未找到 {col_name} 列，当前可用列为: {list(df.columns)}")
     col_data = df[col_name]
     \`\`\`
3. \`parameters\`: 这是一个字典，目前运行期为空 \`{}\`。绝对不要从这里读取列名！
4. 【🌟 空间计算能力开放（极其重要）】：
   传入的 df 已经是一个自带 'geometry' 列的 GeoDataFrame，默认坐标系为 EPSG:4326（单位：度）。
   **警告**：进行距离计算（如 DBSCAN）时，务必先将 df 转换到投影坐标系（如 EPSG:3857，单位：米）。
5. 返回值必须是一个一维的 Python List，长度与传入的 df 的行数完全一致。
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