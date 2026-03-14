import pandas as pd
import numpy as np

def execute(df, parameters):
    # 1. 从参数字典中动态获取用户在前端选择的列名和阈值
    age_col = parameters.get('age_column')
    quality_col = parameters.get('quality_column')
    year_threshold = parameters.get('year_threshold')
    quality_threshold = parameters.get('quality_threshold')

    # 2. 检查必要的列是否存在
    if age_col not in df.columns:
        raise ValueError(f"数据中不存在指定的建筑年代列: '{age_col}'")
    if quality_col not in df.columns:
        raise ValueError(f"数据中不存在指定的建筑质量列: '{quality_col}'")

    # 3. 处理脏数据：将无效值（0、空字符串、纯空格）替换为 NaN
    df[age_col] = df[age_col].replace([0, '', r'^\s*$'], np.nan, regex=True)
    df[quality_col] = df[quality_col].replace([0, '', r'^\s*$'], np.nan, regex=True)

    # 4. 强制类型转换与数据清洗
    # 4.1 建筑年代列：从文本中提取数字年份
    # 使用向量化操作提取年份数字，无法提取的变为 NaN
    year_series = df[age_col].astype(str).str.extract(r'(\d{4})', expand=False)
    # 将提取的文本年份转换为数值，无法转换的变为 NaN
    year_series_numeric = pd.to_numeric(year_series, errors='coerce')

    # 4.2 建筑质量列：确保为数值型
    quality_series_numeric = pd.to_numeric(df[quality_col], errors='coerce')

    # 5. 将阈值参数转换为数值类型（前端可能传字符串）
    try:
        year_threshold_val = float(year_threshold)
        quality_threshold_val = float(quality_threshold)
    except (TypeError, ValueError) as e:
        raise ValueError(f"阈值参数转换失败，请确保输入为有效数字。错误: {e}")

    # 6. 核心逻辑：向量化条件判断
    # 条件1: 建筑年代早于阈值年份 (year < threshold)
    # 注意：NaN 与任何值比较结果都是 False，这符合预期（缺失数据不视为高危）
    condition_year = year_series_numeric < year_threshold_val
    # 条件2: 建筑质量小于阈值 (quality < threshold)
    condition_quality = quality_series_numeric < quality_threshold_val

    # 综合条件：两个条件都满足
    high_risk_mask = condition_year & condition_quality

    # 7. 根据条件掩码，向量化赋值
    # np.where 是向量化操作，性能远优于 for 循环
    risk_classification = np.where(high_risk_mask, '高危建筑', '正常')

    # 8. 返回结果字典
    # 新增列名为 'Risk_Classification'，值为与原始 df 行数一致的列表
    return {"Risk_Classification": risk_classification.tolist()}
