import os
import importlib
import pkgutil
import time
import traceback  # 🌟 1. 必须引入这个，用来打印详细的死因！
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import pandas as pd

app = FastAPI(title="动态模型计算引擎")

class ModelInput(BaseModel):
    model_name: str
    data: List[Dict[str, Any]]
    parameters: Dict[str, Any]

# 内存里的模型注册字典 (不再硬编码写死)
MODEL_REGISTRY = {}

# ==========================================
# 🌟 核心架构：基于反射的动态模型发现机制
# ==========================================
def auto_discover_models():
    """
    扫描 models 文件夹，动态加载所有 Python 模型脚本。
    这是系统具备 Agent 扩展能力的核心底座。
    """
    import models  # 必须确保 models 文件夹下有个 __init__.py 空文件
    
    loaded_count = 0
    # 遍历 models 文件夹下的所有 .py 文件
    for _, module_name, _ in pkgutil.iter_modules(models.__path__):
        try:
            # 动态导入 (等价于 import models.xxx)
            module = importlib.import_module(f"models.{module_name}")
            # 如果脚本里定义了 execute 函数，就把它吸纳入系统
            if hasattr(module, 'execute'):
                # 文件名转大写作为模型名称，如 lsi_ahp -> LSI_AHP
                model_key = module_name.upper()
                MODEL_REGISTRY[model_key] = module.execute
                loaded_count += 1
        except Exception as e:
            print(f"加载模型 {module_name} 失败: {str(e)}")
            
    print(f"[*] 动态扫描完成，已加载 {loaded_count} 个模型: {list(MODEL_REGISTRY.keys())}")

# 启动服务器时先扫描一次
auto_discover_models()

@app.post("/api/models/execute")
async def execute_model(payload: ModelInput):
    start_time = time.time()
    try:
        model_key = payload.model_name.upper()

        if model_key not in MODEL_REGISTRY:
            print(f"[!] 未找到模型 {model_key}，尝试重新扫描 models 目录...")
            importlib.invalidate_caches()
            auto_discover_models()        
            
            if model_key not in MODEL_REGISTRY:
                raise HTTPException(status_code=404, detail=f"模型 {payload.model_name} 未找到")

        # 转换为 DataFrame 提速
        df = pd.DataFrame(payload.data)
        
        # 提取函数指针并执行
        target_func = MODEL_REGISTRY[model_key]
        raw_result = target_func(df, payload.parameters)

        # ==========================================
        # 🌟 终极防御：强制类型清洗，防止序列化崩溃
        # ==========================================
        # 1. 如果 AI 返回的是 Pandas Series 或 Numpy Array，强制转为 list
        if hasattr(raw_result, 'tolist'):
            raw_result = raw_result.tolist()
            
        # 2. 深度清洗：确保列表里的每一个元素都是原生 float/int，处理 NaN 空值
        # 因为 JSON 不认识 np.float64 和 NaN！
        clean_result = []
        for x in raw_result:
            if pd.isna(x):
                clean_result.append(0.0)
            else:
                clean_result.append(float(x))

        return {
            "status": "success",
            "result_array": clean_result, # 🌟 返回清洗后的绝对安全数组
            "execution_time_ms": (time.time() - start_time) * 1000
        }
        
    except Exception as e:
        # ==========================================
        # 🌟 显微镜：将大模型代码的报错明明白白打印出来
        # ==========================================
        print(f"\n{'='*50}")
        print(f"❌ 算子执行崩溃: {payload.model_name}")
        traceback.print_exc()  # 把 Python 底层报错堆栈打印到终端
        print(f"{'='*50}\n")
        
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)