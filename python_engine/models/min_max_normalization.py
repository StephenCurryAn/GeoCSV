import pandas as pd
import numpy as np

def execute(df, parameters):
    # 1. 从参数中动态获取列名
    col1_name = parameters.get('column1')
    col2_name = parameters.get('column2')
    
    # 2. 检查列名是否存在
    if col1_name not in df.columns:
        raise ValueError(f"列 '{col1_name}' 在数据中不存在。")
    if col2_name not in df.columns:
        raise ValueError(f"列 '{col2_name}' 在数据中不存在。")
    
    # 3. 提取数据并处理脏数据（将0和空字符串视为缺失值）
    # 注意：底层可能已将空值填充为0或空字符串，这里我们将其视为无效值。
    # 对于数值列，我们将0和空字符串替换为np.nan，但保留其他数值。
    # 然而，归一化需要基于有效数据的范围，因此我们只对非缺失值进行计算。
    
    # 复制原始列数据
    series1_original = df[col1_name].copy()
    series2_original = df[col2_name].copy()
    
    # 将可能存在的填充值（0或空字符串）转换为np.nan
    # 首先确保是数值类型，非数值的尝试转换
    try:
        series1_numeric = pd.to_numeric(series1_original, errors='coerce')
    except Exception as e:
        raise ValueError(f"列 '{col1_name}' 无法转换为数值类型: {e}")
    try:
        series2_numeric = pd.to_numeric(series2_original, errors='coerce')
    except Exception as e:
        raise ValueError(f"列 '{col2_name}' 无法转换为数值类型: {e}")
    
    # 将0值也视为缺失值？根据需求，用户可能希望0参与归一化。
    # 但根据【脏数据处理原则】，对于严格统计，应将无效的0替换为nan。
    # 然而，归一化通常处理的是有效观测值，0可能是有意义的（如威胁为0）。
    # 这里我们采取保守策略：仅将np.nan（原始缺失或转换失败）视为缺失。
    # 因此，我们使用转换后的数值系列，其中无效值已是np.nan。
    
    # 计算每列的有效数据（非nan）的最小值和最大值
    min1 = series1_numeric.min(skipna=True)
    max1 = series1_numeric.max(skipna=True)
    min2 = series2_numeric.min(skipna=True)
    max2 = series2_numeric.max(skipna=True)
    
    # 4. 检查数据有效性（防止除零或无效范围）
    if pd.isna(min1) or pd.isna(max1):
        raise ValueError(f"列 '{col1_name}' 中没有有效的数值数据。")
    if pd.isna(min2) or pd.isna(max2):
        raise ValueError(f"列 '{col2_name}' 中没有有效的数值数据。")
    
    # 如果最大值等于最小值，归一化公式会导致除零，此时将所有有效值设为0.5（或0？）
    # 但通常这种情况表示数据为常数，归一化无意义。我们将其设为0，并警告？
    # 这里我们将其归一化为0.5，表示中间值。
    
    # 初始化结果列表，长度与原始df一致
    norm1_list = []
    norm2_list = []
    
    # 遍历每一行，进行归一化
    for idx in range(len(df)):
        val1 = series1_numeric.iloc[idx]
        val2 = series2_numeric.iloc[idx]
        
        # 对第一列归一化
        if pd.isna(val1):
            norm1 = np.nan
        else:
            if max1 == min1:
                norm1 = 0.5  # 常数列归一化为中值
            else:
                norm1 = (val1 - min1) / (max1 - min1)
        
        # 对第二列归一化
        if pd.isna(val2):
            norm2 = np.nan
        else:
            if max2 == min2:
                norm2 = 0.5  # 常数列归一化为中值
            else:
                norm2 = (val2 - min2) / (max2 - min2)
        
        norm1_list.append(norm1)
        norm2_list.append(norm2)
    
    # 5. 返回结果字典，新增列名基于原始列名生成
    new_col1_name = f"{col1_name}_Normalized"
    new_col2_name = f"{col2_name}_Normalized"
    
    return {new_col1_name: norm1_list, new_col2_name: norm2_list}
