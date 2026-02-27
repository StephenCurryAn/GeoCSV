import os
import importlib
import pkgutil
import time
import traceback
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import pandas as pd
import geopandas as gpd
from shapely.geometry import shape

app = FastAPI(title="动态模型计算引擎")

class ModelInput(BaseModel):
    model_name: str
    data: List[Dict[str, Any]]
    parameters: Dict[str, Any]

MODEL_REGISTRY = {}

def auto_discover_models():
    import models  
    loaded_count = 0
    for _, module_name, _ in pkgutil.iter_modules(models.__path__):
        try:
            module = importlib.import_module(f"models.{module_name}")
            if hasattr(module, 'execute'):
                model_key = module_name.upper()
                MODEL_REGISTRY[model_key] = module.execute
                loaded_count += 1
        except Exception as e:
            print(f"加载模型 {module_name} 失败: {str(e)}")
    print(f"[*] 动态扫描完成，已加载 {loaded_count} 个模型: {list(MODEL_REGISTRY.keys())}")

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
                raise HTTPException(status_code=404, detail=f"模型 {payload.model_name} 未在系统中找到")

        # 1. 先转换为普通 DataFrame
        df = pd.DataFrame(payload.data)
        
        # ==========================================
        # 🌟 核心突破：空间觉醒！将普通表格升级为空间 GeoDataFrame
        # ==========================================
        if '_geometry' in df.columns:
            # 使用 Shapely 将 GeoJSON 的 geometry 字典转换为 Python 原生几何对象
            # 注意处理 _geometry 可能为 None 的情况
            df['geometry'] = df['_geometry'].apply(lambda g: shape(g) if g and isinstance(g, dict) else None)
            
            # 升级为 GeoPandas 对象！
            df = gpd.GeoDataFrame(df, geometry='geometry')
            
            # 设置默认坐标系 (通常前端传过来的 GeoJSON 是 WGS84 经纬度: EPSG:4326)
            df.set_crs(epsg=4326, inplace=True, allow_override=True)
            
            # 为了防止干扰后续大模型写代码，把原始的 _geometry 字典列删掉
            df.drop(columns=['_geometry'], inplace=True)

        # 提取函数指针并执行
        target_func = MODEL_REGISTRY[model_key]
        raw_result = target_func(df, payload.parameters)

        # ==========================================
        # 🌟 终极防御：强制类型清洗，防止序列化崩溃
        # ==========================================
        if hasattr(raw_result, 'tolist'):
            raw_result = raw_result.tolist()
            
        clean_result = []
        for x in raw_result:
            if pd.isna(x):
                clean_result.append(0.0)
            else:
                clean_result.append(float(x))

        return {
            "status": "success",
            "result_array": clean_result,
            "execution_time_ms": (time.time() - start_time) * 1000
        }
    except Exception as e:
        print(f"\n{'='*50}")
        print(f"❌ 算子执行崩溃: {payload.model_name}")
        traceback.print_exc()
        print(f"{'='*50}\n")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)