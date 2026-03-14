import pandas as pd
import numpy as np

def execute(df, parameters):
    """
    计算滑坡综合风险指数并进行五级分类。
    逻辑：
    1. 对威胁人数和威胁财产进行归一化（Min-Max）。
    2. 综合风险指数 = (归一化人口 * 0.6) + (归一化财产 * 0.4)。
    3. 如果隐患点列的值 > 0，则风险指数乘以系数 1.2。
    4. 根据风险指数，使用分位数将结果分为五类（极低、低、中等、高、极高）。
    """
    # 1. 从parameters动态获取列名
    pop_col = parameters.get('population_column')
    prop_col = parameters.get('property_column')
    hazard_col = parameters.get('hazard_column')
    
    # 2. 检查列是否存在
    required_cols = [pop_col, prop_col, hazard_col]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"参数错误：列 '{col}' 在数据中不存在。")
    
    # 3. 数据清洗与类型转换
    # 将无效值（0，空字符串，纯空格）替换为 NaN
    for col in [pop_col, prop_col, hazard_col]:
        df[col] = df[col].replace([0, '', r'^\s*$'], np.nan, regex=True)
    
    # 强制转换为数值型，无法转换的变为 NaN
    df[pop_col] = pd.to_numeric(df[pop_col], errors='coerce')
    df[prop_col] = pd.to_numeric(df[prop_col], errors='coerce')
    df[hazard_col] = pd.to_numeric(df[hazard_col], errors='coerce')
    
    # 4. 归一化处理 (Min-Max Scaling)
    # 注意：忽略NaN值进行计算
    pop_min = df[pop_col].min(skipna=True)
    pop_max = df[pop_col].max(skipna=True)
    prop_min = df[prop_col].min(skipna=True)
    prop_max = df[prop_col].max(skipna=True)
    
    # 检查分母是否为0（即所有有效值相同或只有一个有效值）
    if (pop_max - pop_min) == 0:
        norm_pop = pd.Series(0.0, index=df.index)
    else:
        norm_pop = (df[pop_col] - pop_min) / (pop_max - pop_min)
    
    if (prop_max - prop_min) == 0:
        norm_prop = pd.Series(0.0, index=df.index)
    else:
        norm_prop = (df[prop_col] - prop_min) / (prop_max - prop_min)
    
    # 5. 计算基础风险指数
    risk_index = (norm_pop * 0.6) + (norm_prop * 0.4)
    
    # 6. 根据隐患点状态调整风险指数
    # 隐患点值 > 0 时，乘以系数 1.2
    adjustment_condition = (df[hazard_col] > 0)
    risk_index = np.where(adjustment_condition, risk_index * 1.2, risk_index)
    
    # 7. 风险分级（五类：极低，低，中等，高，极高）
    # 使用分位数（qcut）进行等样本量划分，处理NaN值
    risk_series = pd.Series(risk_index, index=df.index)
    # 移除NaN值用于计算分位数边界
    valid_risk = risk_series.dropna()
    
    if len(valid_risk) < 5:
        # 如果有效数据少于5个，无法分成5类，全部标记为'数据不足'
        risk_category = pd.Series('数据不足', index=df.index, dtype=object)
    else:
        try:
            # 使用qcut，labels对应五类
            categories = pd.qcut(valid_risk, q=5, labels=['极低', '低', '中等', '高', '极高'], duplicates='drop')
            # 重新索引到原始df，NaN位置保持NaN
            risk_category = pd.Series(np.nan, index=df.index, dtype=object)
            risk_category.loc[valid_risk.index] = categories.astype(str)
        except Exception as e:
            # 如果qcut失败（例如值过于集中），使用等间距分箱作为备选
            print(f"警告：分位数分箱失败，使用等间距分箱。错误信息: {e}")
            try:
                categories = pd.cut(valid_risk, bins=5, labels=['极低', '低', '中等', '高', '极高'])
                risk_category = pd.Series(np.nan, index=df.index, dtype=object)
                risk_category.loc[valid_risk.index] = categories.astype(str)
            except Exception as e2:
                print(f"错误：等间距分箱也失败。错误信息: {e2}")
                # 最终备选：全部标记为'计算错误'
                risk_category = pd.Series('计算错误', index=df.index, dtype=object)
    
    # 8. 将风险指数和风险类别作为新列返回
    # 确保返回的列表长度与原始df行数一致
    risk_index_list = risk_index.tolist() if isinstance(risk_index, np.ndarray) else risk_index
    risk_category_list = risk_category.tolist()
    
    return {
        "Landslide_Risk_Index": risk_index_list,
        "Risk_Category": risk_category_list
    }