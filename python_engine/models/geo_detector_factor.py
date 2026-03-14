import pandas as pd
import numpy as np
from typing import Dict, List, Any

def execute(df: pd.DataFrame, parameters: Dict[str, Any]) -> Dict[str, List[Any]]:
    """
    执行地理探测器因子探测，计算每个自变量的q值。
    返回一个字典，其中键为新增列名，值为与输入df行数等长的列表。
    """
    # 1. 从parameters动态获取列名
    y_col = parameters.get('y_column')
    x_cols_raw = parameters.get('x_columns')
    
    # 2. 检查列名是否存在
    if y_col not in df.columns:
        raise ValueError(f"因变量列 '{y_col}' 在数据中不存在。")
    
    # 3. 处理x_columns参数：前端可能传字符串或列表
    if isinstance(x_cols_raw, str):
        # 假设列名用逗号分隔
        x_cols = [col.strip() for col in x_cols_raw.split(',') if col.strip()]
    elif isinstance(x_cols_raw, list):
        x_cols = x_cols_raw
    else:
        raise ValueError("参数 'x_columns' 格式错误，应为字符串或列表。")
    
    if not x_cols:
        raise ValueError("至少需要选择一个自变量列。")
    
    for col in x_cols:
        if col not in df.columns:
            raise ValueError(f"自变量列 '{col}' 在数据中不存在。")
    
    # 4. 数据预处理：处理脏数据
    # 因变量Y：必须是数值型
    y_series = df[y_col].copy()
    # 替换无效值为NaN
    y_series = y_series.replace([0, '', r'^\s*$'], np.nan, regex=True)
    # 强制转换为数值，非数值变NaN
    y_series = pd.to_numeric(y_series, errors='coerce')
    
    # 检查Y是否有足够有效数据
    y_valid = y_series.dropna()
    if len(y_valid) < 2:
        raise ValueError(f"因变量 '{y_col}' 有效数据少于2条，无法计算。")
    if y_valid.var() == 0:
        raise ValueError(f"因变量 '{y_col}' 方差为0，无法计算。")
    
    # 5. 准备存储q值的列表
    q_values = []
    x_names = []
    
    # 6. 对每个自变量X进行计算
    for x_col in x_cols:
        x_series = df[x_col].copy()
        # 替换无效值为NaN
        x_series = x_series.replace([0, '', r'^\s*$'], np.nan, regex=True)
        
        # 检查X是否为数值型，若是则离散化
        try:
            x_numeric = pd.to_numeric(x_series, errors='coerce')
            # 如果大部分值能转为数值，则视为连续变量，进行离散化
            if x_numeric.notna().sum() > len(x_series) * 0.5:
                # 使用qcut分为5类，处理NaN和唯一值不足的情况
                try:
                    x_discrete = pd.qcut(x_numeric, q=5, duplicates='drop', labels=False)
                    # qcut可能产生NaN，用原始值填充或标记
                    x_discrete = x_discrete.fillna(-1).astype(str)
                    x_series_processed = x_discrete
                except Exception as e:
                    # 如果qcut失败（如唯一值太少），直接使用原始数值的字符串形式
                    print(f"列 '{x_col}' 离散化失败，使用原始值: {e}")
                    x_series_processed = x_series.fillna('NaN').astype(str)
            else:
                # 非数值列，直接转为字符串处理
                x_series_processed = x_series.fillna('NaN').astype(str)
        except Exception as e:
            print(f"列 '{x_col}' 类型判断异常，按字符串处理: {e}")
            x_series_processed = x_series.fillna('NaN').astype(str)
        
        # 确保处理后的X是字符串类型（分类标签）
        x_series_processed = x_series_processed.astype(str)
        
        # 合并Y和X，并删除任何一方为NaN的行
        data = pd.DataFrame({
            'y': y_series,
            'x': x_series_processed
        }).dropna(subset=['y', 'x'])
        
        if len(data) < 2:
            print(f"警告: 列 '{x_col}' 与Y的有效配对数据少于2条，跳过。")
            q_values.append(np.nan)
            x_names.append(x_col)
            continue
        
        # 计算总方差
        total_variance = data['y'].var(ddof=0)  # 使用总体方差
        if total_variance == 0:
            print(f"警告: 列 '{x_col}' 对应的Y子集方差为0，跳过。")
            q_values.append(np.nan)
            x_names.append(x_col)
            continue
        
        # 分组计算组内方差
        group_vars = []
        group_counts = []
        for name, group in data.groupby('x'):
            if len(group) >= 1:
                group_var = group['y'].var(ddof=0) if len(group) > 1 else 0
                group_vars.append(group_var)
                group_counts.append(len(group))
        
        if not group_vars:
            print(f"警告: 列 '{x_col}' 无法形成有效分组，跳过。")
            q_values.append(np.nan)
            x_names.append(x_col)
            continue
        
        # 计算q值: q = 1 - (Σ(N_h * σ_h^2)) / (N * σ^2)
        weighted_variance = sum(g_var * g_count for g_var, g_count in zip(group_vars, group_counts))
        q = 1 - (weighted_variance / (len(data) * total_variance))
        
        # q值应在0-1之间，但可能因数值误差略微超出
        q = max(0.0, min(1.0, q))
        
        q_values.append(q)
        x_names.append(x_col)
    
    # 7. 构建返回结果：q值需要扩展为与df行数等长的列表
    result_dict = {}
    
    # 新增列1: 因子名称汇总
    factor_names_str = ", ".join(x_names)
    result_dict['Detector_Factors'] = [factor_names_str] * len(df)
    
    # 新增列2: q值汇总
    q_values_str = ", ".join([f"{q:.4f}" if not pd.isna(q) else "NaN" for q in q_values])
    result_dict['Detector_Q_Values'] = [q_values_str] * len(df)
    
    # 新增列3: 每个因子的q值单独一列（便于查看）
    for x_name, q_val in zip(x_names, q_values):
        col_name = f"Q_{x_name}"
        # 安全处理列名中的特殊字符
        col_name_safe = "".join(c if c.isalnum() else "_" for c in col_name)
        q_val_str = f"{q_val:.4f}" if not pd.isna(q_val) else "NaN"
        result_dict[col_name_safe] = [q_val_str] * len(df)
    
    return result_dict
