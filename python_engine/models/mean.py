import pandas as pd
import numpy as np

def execute(df, parameters):
    try:
        result_list = [0] * len(df)
        if len(df.columns) < 2:
            raise ValueError("DataFrame 至少需要两列数据")
        col1_name = df.columns[0]
        col2_name = df.columns[1]
        col1 = pd.to_numeric(df[col1_name], errors='coerce').fillna(0)
        col2 = pd.to_numeric(df[col2_name], errors='coerce').fillna(0)
        result_list = ((col1 + col2) / 2).tolist()
        return result_list
    except Exception as e:
        raise ValueError(f"模型计算出错: {str(e)}")