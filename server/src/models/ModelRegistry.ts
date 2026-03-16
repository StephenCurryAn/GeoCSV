import mongoose, { Document, Schema } from 'mongoose';

// DOM树输入节点
export interface IDomInputNode {
  id: string;               // 节点标识，如 "rainfall_data"
  type: string;             // 空间数据类型，如 "Time_Series", "Vector_Feature", "Raster"
  format: string;           // 底层模型真正需要的文件后缀（如 ".inp", ".shp", ".csv"）
  description: string;      // 业务描述：提示大模型该节点需要什么样的数据（如："SWMM模型需要的标准降雨时间序列文本"）
  
  // 行为脚本 ,初始化时为空，仅当平台发现用户传入的数据格式与 format 不符时，由 LLM 即时生成并注入
  behaviorScript?: string; 
  
  // 可选约束：底层模型对数据内部结构的强制要求
  expectedSchema?: string[]; 
}

// DOM树输出节点
export interface IDomOutputNode {
  id: string;               // 输出节点标识，如 "flood_depth"
  type: string;             // 空间数据类型
  format: string;           // 输出的格式，如 ".tif"
  description: string;      // 输出结果描述
}

export interface IModelRegistry extends Document {
  modelName: string;       // 例如 "LSI_AHP"
  displayName: string;     // 例如 "AHP滑坡易发性评估"
  description: string;

  type: 'function' | 'container'; // 'function'为原有轻量脚本，'container'为重量级Docker模型

  parameters?: {            // 记录参数，方便后续前端做智能提示
    name: string;
    type: string;
    description: string;
  }[];
  requiredColumns?: string[];
  
  // 仅 container 类型模型需要以下字段(DOM)
  containerMeta?: {
    baseEnv: 'lite' | 'spatial' | 'water' | 'custom'; //预设好的环境，是可以增加的
    entrypoint: string;
    imageName: string; // 构建成功后的 Docker 镜像标签，如 geocsv/swmm_flood:latest
    domTree: {
      inputs: IDomInputNode[];  // 柔性 DOM 树输入节点
      outputs: IDomOutputNode[]; // 柔性 DOM 树输出节点
    };
  };
  
  status: 'active' | 'building' | 'failed'; // 增加 building 状态;
}

const ModelRegistrySchema = new Schema({
  modelName: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  description: { type: String },

  type: { type: String, enum: ['function', 'container'], default: 'function' },

  parameters: [{
    name: String,
    type: { type: String, enum: ['column', 'number', 'string'] },
    description: String
  }],
  requiredColumns: [{ type: String }], 

  // 容器化专用元数据
  containerMeta: {
    baseEnv: { type: String, enum: ['lite', 'spatial', 'water', 'custom'] },
    entrypoint: { type: String },
    imageName: { type: String },
    domTree: {
      // 在 Mongoose 层面，对于复杂的嵌套数组字典，使用 Mixed 保持最大灵活性
      // 但在 TS 层面已经被上方的 IDomInputNode 严格约束了，非常安全
      inputs: { type: Schema.Types.Mixed, default: [] },
      outputs: { type: Schema.Types.Mixed, default: [] }
    }
  },

  status: { type: String, default: 'active' }
}, { timestamps: true });

export default mongoose.model<IModelRegistry>('ModelRegistry', ModelRegistrySchema);