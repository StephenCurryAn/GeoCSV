import pandas as pd

def execute(df: pd.DataFrame, params: dict) -> list:
    """简单的两列相加模型"""
    if df.shape[1] < 2:
        raise ValueError("加法模型需要传入至少两列数据")
    
    # 因为前端传过来的 df 只包含我们指定的两列，所以直接取前两列即可
    col1, col2 = df.columns[0], df.columns[1]
    
    # 转换为数值类型，如果遇到非数字（如空值或文本），自动填充为 0
    s1 = pd.to_numeric(df[col1], errors='coerce').fillna(0)
    s2 = pd.to_numeric(df[col2], errors='coerce').fillna(0)
    
    # 矩阵向量化相加，速度极快
    result = s1 + s2
    return result.tolist()
