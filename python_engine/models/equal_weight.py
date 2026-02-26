import pandas as pd
import numpy as np

def execute(df, parameters):
    try:
        result_list = [0] * len(df)
        if df.empty:
            return result_list
            
        numeric_df = df.select_dtypes(include=[np.number])
        if numeric_df.empty:
            return result_list
            
        row_sums = numeric_df.sum(axis=1, skipna=True)
        col_count = numeric_df.shape[1]
        
        if col_count > 0:
            row_means = row_sums / col_count
            result_list = row_means.fillna(0).tolist()
        else:
            result_list = [0] * len(df)
            
        return result_list
    except Exception as e:
        raise ValueError(f"模型计算出错: {str(e)}")