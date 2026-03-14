import pandas as pd
import numpy as np
from typing import Dict, List, Union

def execute(df: pd.DataFrame, parameters: Dict) -> Dict:
    """
    地理探测器因子探测主函数。
    计算每个自变量X对因变量Y的解释力q值。
    """
    # 1. 从parameters动态获取列名
    y_col = parameters.get('y_column')
    x_cols_input = parameters.get('x_columns')
    
    # 2. 检查列名是否存在
    if y_col not in df.columns:
        raise ValueError(f"因变量列 '{y_col}' 不存在于数据中。")
    
    # 3. 处理x_columns参数：前端可能传入字符串或列表
    if isinstance(x_cols_input, str):
        # 假设列名以逗号分隔
        x_cols = [col.strip() for col in x_cols_input.split(',') if col.strip()]
    elif isinstance(x_cols_input, list):
        x_cols = x_cols_input
    else:
        raise TypeError(f"参数 'x_columns' 应为字符串或列表，但收到 {type(x_cols_input)}。")
    
    if len(x_cols) == 0:
        raise ValueError("至少需要指定一个自变量列。")
    
    for col in x_cols:
        if col not in df.columns:
            raise ValueError(f"自变量列 '{col}' 不存在于数据中。")
    
    # 4. 数据预处理：处理脏数据
    # 因变量Y：必须是连续数值型
    y_series = df[y_col].copy()
    # 替换无效值为NaN
    y_series = y_series.replace([0, '', r'^\s*$'], np.nan, regex=True)
    # 强制转换为数值，非数值变NaN
    y_series = pd.to_numeric(y_series, errors='coerce')
    
    # 检查Y是否有有效数据
    if y_series.notna().sum() < 2:
        raise ValueError(f"因变量列 '{y_col}' 有效数据不足（少于2个）。")
    
    # 计算全局总方差SST
    y_valid = y_series.dropna()
    y_mean = y_valid.mean()
    SST = ((y_valid - y_mean) ** 2).sum()
    if SST == 0:
        raise ValueError(f"因变量列 '{y_col}' 的方差为零，无法计算地理探测器。")
    
    # 5. 为每个自变量计算q值
    q_values = []
    for x_col in x_cols:
        x_series = df[x_col].copy()
        # 替换无效值为NaN
        x_series = x_series.replace([0, '', r'^\s*$'], np.nan, regex=True)
        
        # 判断X是否为数值型，并决定是否离散化
        # 尝试转换为数值
        x_numeric = pd.to_numeric(x_series, errors='coerce')
        if x_numeric.notna().sum() > 0:
            # 有数值数据，视为连续变量，需要离散化
            # 使用qcut分为5类，处理NaN和唯一值不足的情况
            try:
                # 只对非NaN值进行分箱
                valid_mask = x_numeric.notna()
                if x_numeric[valid_mask].nunique() >= 5:
                    # 唯一值足够，使用qcut
                    x_discrete = pd.qcut(x_numeric[valid_mask], q=5, duplicates='drop', labels=False)
                else:
                    # 唯一值不足，按唯一值本身作为类别
                    unique_vals = x_numeric[valid_mask].unique()
                    # 创建映射字典
                    val_to_cat = {val: i for i, val in enumerate(sorted(unique_vals))}
                    x_discrete = x_numeric[valid_mask].map(val_to_cat)
                
                # 将离散化结果放回原Series（NaN保持NaN）
                x_cat_series = pd.Series(np.nan, index=x_series.index, dtype=object)
                x_cat_series[valid_mask] = x_discrete.astype(str)  # 转换为字符串类别
                x_series = x_cat_series
            except Exception as e:
                print(f"列 '{x_col}' 离散化时出错: {e}")
                # 出错则按原始值作为类别（转换为字符串）
                x_series = x_series.astype(str)
        else:
            # 无法转换为数值，视为类别变量，直接使用字符串形式
            x_series = x_series.astype(str)
        
        # 现在x_series是字符串类别的Series（NaN是NaN）
        # 合并Y和X，并删除任何一方为NaN的行
        combined = pd.DataFrame({'y': y_series, 'x': x_series})
        combined = combined.dropna(subset=['y', 'x'])
        
        if len(combined) < 2:
            q_values.append(np.nan)
            continue
        
        # 计算每个类别内的方差和
        SSW = 0
        for category in combined['x'].unique():
            y_in_cat = combined.loc[combined['x'] == category, 'y']
            if len(y_in_cat) >= 1:
                cat_mean = y_in_cat.mean()
                SSW += ((y_in_cat - cat_mean) ** 2).sum()
        
        # 计算q值
        q = 1 - (SSW / SST) if SST != 0 else np.nan
        q_values.append(q)
    
    # 6. 准备返回值：q值需要填充到与原始df行数一致
    result_dict = {}
    for i, x_col in enumerate(x_cols):
        col_name = f"Q_Value_{x_col}"
        q_val = q_values[i]
        # 将q值（可能为NaN）填充为列表
        if pd.isna(q_val):
            filled_list = [np.nan] * len(df)
        else:
            filled_list = [q_val] * len(df)
        result_dict[col_name] = filled_list
    
    return result_dict