import pandas as pd
import numpy as np

def execute(df, parameters):
    try:
        # 1. 按顺序提取三列数据（严格使用 iloc）
        col1 = pd.to_numeric(df.iloc[:, 0], errors='coerce').fillna(0)
        col2 = pd.to_numeric(df.iloc[:, 1], errors='coerce').fillna(0)
        col3 = pd.to_numeric(df.iloc[:, 2], errors='coerce').fillna(0)
        
        # 2. 执行核心算法逻辑：三列对应行相乘
        result = col1 * col2 * col3
        
        # 3. 返回 List
        return result.tolist()
    except Exception as e:
        raise ValueError(f"模型计算出错: {str(e)}")