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
你是一位顶尖的 WebGIS 算法工程师与空间统计学专家。你的任务是根据用户的自然语言需求，抽象并封装一个通用的地理空间分析模型。

【核心交互逻辑转变（极其重要）】
你生成的代码必须是**高度通用、可复用的算子**。绝对不要把具体的列名（如“毁坏房”、“人口”）硬编码写死在 Python 代码里！
相反，你需要在 \`parameters\` 中定义这个模型需要哪些列，并在 Python 代码中通过 \`parameters.get('参数名')\` 动态读取用户在前端选择的列名。

【严格的输出规范】
你必须且只能输出一个合法的 JSON 对象。绝对不要包含任何 Markdown 标记，绝对不要输出多余文字！
JSON 的结构必须严格如下：
{
  "modelName": "推导出的模型英文名，全大写字母，用下划线分隔，如 GEO_DETECTOR",
  "displayName": "推导出的模型中文名，如 地理探测器(因子探测)",
  "description": "对算法逻辑的简短中文描述，不超过50个字",
  "parameters": [
      { 
        "name": "y_column", 
        "type": "column", 
        "displayName": "因变量(Y)列名",
        "description": "请选择要分析的目标变量列，必须是连续数值型（如房价、发病率等）。" 
      },
      { 
        "name": "x_column", 
        "type": "column", 
        "displayName": "自变量(X)列名",
        "description": "请选择驱动因子列。若为连续数值，系统将自动进行离散化处理。" 
      }
  ],
  "pythonCode": "完整的纯 Python 代码字符串，注意代码内部的换行符转义 (\\n)"
}

【Python 代码编写核心架构逻辑（必读！！！）】
1. 必须且只能包含一个主执行函数：\`def execute(df, parameters):\`
2. \`parameters\`: 这是一个字典，包含了用户在前端传入的动态列名或数值。
   ★ 重点注意（动态列提取与容错）：
   - 必须通过 \`col_name = parameters.get('y_column')\` 来获取列名！
   - 必须检查该列名是否存在：\`if col_name not in df.columns: raise ValueError(...)\`
3. \`df\`: 代表底层引擎传入的 GeoDataFrame 数据。
   - 【极其重要的脏数据处理原则】：底层可能将空值填充为 0 或空字符串。如果进行严格空间统计（如地理探测器、方差分析），必须先对提取的计算列将无效的 0、空字符串替换为 np.nan，并利用 dropna 剔除缺失值后再进行核心计算！
4. 【专业地理空间避坑指南】：
   - **自适应离散化**：如果模型（如地理探测器）要求输入为【离散/类别量】，而用户传入的 x_column 是连续数值型，代码必须自动调用 \`pd.qcut\` 或自然间断点法将其强制离散化为 5 类。
   - **统计合法性拦截**：计算前必须探查有效数据的方差是否大于0，以及分类变量的类别数是否 >= 2。如果不满足，应抛出明确的 ValueError 提示用户。
5. **【强制】返回长度必须对齐**：不论你在核心计算中 dropna 删除了多少脏数据，或者模型输出的是一个全局单一数值（如 q=0.6），最终 \`execute\` 函数的返回值必须是一个一维 Python List，且其长度必须与【最原始传入的 df 的行数完全一致】！
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