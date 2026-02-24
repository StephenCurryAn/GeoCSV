import os
import importlib
import pkgutil
import time
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

        # 【智能热插拔逻辑】：如果字典里找不到这个模型，可能是 AI 刚刚写入了新文件！
        # 此时主动触发一次重新扫描 (Auto-Discovery on demand)
        if model_key not in MODEL_REGISTRY:
            print(f"[!] 未找到模型 {model_key}，尝试重新扫描 models 目录...")
            importlib.invalidate_caches() # 清除 import 缓存
            auto_discover_models()        # 重新加载
            
            # 如果重新扫描后还是没有，说明确实不存在
            if model_key not in MODEL_REGISTRY:
                raise HTTPException(status_code=404, detail=f"模型 {payload.model_name} 未在系统中找到对应的执行脚本")

        # 转换为 DataFrame 提速
        df = pd.DataFrame(payload.data)
        
        # 提取函数指针并执行
        target_func = MODEL_REGISTRY[model_key]
        result_array = target_func(df, payload.parameters)

        return {
            "status": "success",
            "result_array": result_array,
            "execution_time_ms": (time.time() - start_time) * 1000
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)