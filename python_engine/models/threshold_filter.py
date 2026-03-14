import pandas as pd
import numpy as np

def execute(df, parameters):
    """
    根据阈值筛选数据，大于阈值标记为1，否则为0。
    """
    # 1. 从参数中动态获取列名和阈值
    target_col_name = parameters.get('target_column')
    threshold_str = parameters.get('threshold')
    
    # 2. 检查列名是否存在
    if target_col_name not in df.columns:
        raise ValueError(f"数据中不存在名为 '{target_col_name}' 的列。")
    
    # 3. 处理脏数据：将无效值替换为 NaN
    # 注意：这里我们假设底层可能填充了0或空字符串，但目标列应为数值型。
    # 我们将0、空字符串、纯空格视为无效，替换为NaN。
    df[target_col_name] = df[target_col_name].replace([0, '', r'^\s*$'], np.nan, regex=True)
    
    # 4. 强制将目标列转换为数值类型（浮点数），无法转换的变为NaN
    target_series_numeric = pd.to_numeric(df[target_col_name], errors='coerce')
    
    # 5. 将阈值从字符串转换为浮点数（前端传入的非列名参数可能是字符串）
    try:
        threshold_val = float(threshold_str)
    except (ValueError, TypeError):
        raise ValueError(f"无法将阈值参数 '{threshold_str}' 转换为有效的数字。")
    
    # 6. 核心逻辑：使用向量化操作进行比较并赋值
    # 大于阈值的标记为1，否则为0。NaN值在比较中会返回False，因此会被标记为0。
    # 使用 np.where 进行向量化赋值，性能高且安全。
    result_series = np.where(target_series_numeric > threshold_val, 1, 0)
    
    # 7. 构造返回字典
    # 新增列名为 'Flag_Above_Threshold'
    return {"Flag_Above_Threshold": result_series.tolist()}
