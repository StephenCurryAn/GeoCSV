import pandas as pd
import numpy as np

def execute(df, parameters):
    try:
        # 从参数中获取列名，若未提供则尝试使用前两列
        col1_name = parameters.get('col1', None)
        col2_name = parameters.get('col2', None)
        
        # 如果参数未指定列名，则尝试使用DataFrame的前两列
        if col1_name is None or col2_name not in df.columns:
            if len(df.columns) >= 2:
                col1_name = df.columns[0]
                col2_name = df.columns[1]
            else:
                raise ValueError("数据列不足，至少需要两列数据。")
        else:
            # 检查指定的列名是否存在
            if col1_name not in df.columns:
                raise ValueError(f"列名 '{col1_name}' 在数据中不存在。")
            if col2_name not in df.columns:
                raise ValueError(f"列名 '{col2_name}' 在数据中不存在。")
        
        # 获取数据列，转换为数值类型，非数值或缺失值填充为0
        col1_data = pd.to_numeric(df[col1_name], errors='coerce').fillna(0).astype(float)
        col2_data = pd.to_numeric(df[col2_name], errors='coerce').fillna(0).astype(float)
        
        # 执行相减操作
        result_series = col1_data - col2_data
        
        # 将结果转换为列表，确保长度与输入一致
        result_list = result_series.tolist()
        
        return result_list
    except Exception as e:
        raise ValueError(f"模型计算出错: {str(e)}")