import pandas as pd
import numpy as np

def execute(df, parameters):
    # 1. 从参数中动态获取列名和数值
    loc_col_name = parameters.get('location_column')
    prefix_len = parameters.get('prefix_length')
    
    # 2. 参数有效性检查
    if loc_col_name is None:
        raise ValueError("参数 'location_column' 未提供。")
    if prefix_len is None:
        raise ValueError("参数 'prefix_length' 未提供。")
    
    # 强制转换数值参数类型（前端可能传字符串）
    try:
        prefix_len = int(prefix_len)
    except (ValueError, TypeError):
        raise ValueError("参数 'prefix_length' 必须是一个整数。")
    
    if prefix_len <= 0:
        raise ValueError("参数 'prefix_length' 必须是一个正整数。")
    
    # 3. 检查列是否存在
    if loc_col_name not in df.columns:
        raise ValueError(f"数据框中不存在名为 '{loc_col_name}' 的列。")
    
    # 4. 脏数据处理：将无效值替换为 NaN
    # 注意：地理位置列是文本，我们将空字符串、纯空格、0（如果存在）视为无效
    df[loc_col_name] = df[loc_col_name].replace([0, '', r'^\s*$'], np.nan, regex=True)
    
    # 5. 初始化结果列（注意：要存储字符串，必须指定 dtype=object）
    region_series = pd.Series(np.nan, index=df.index, dtype=object)
    
    # 6. 核心逻辑：使用向量化操作提取前缀作为区域分类
    # 先创建一个掩码，标识非空的有效行
    valid_mask = df[loc_col_name].notna()
    
    if valid_mask.any():
        # 对有效行，提取前 prefix_len 个字符
        # 使用 .str 访问器进行向量化字符串操作
        extracted_prefixes = df.loc[valid_mask, loc_col_name].str.slice(stop=prefix_len)
        
        # 去除提取出的前缀两端的空白字符
        extracted_prefixes = extracted_prefixes.str.strip()
        
        # 将处理后的前缀赋值给结果列
        region_series.loc[valid_mask] = extracted_prefixes
    
    # 7. 将结果转换为列表，确保长度与原始df一致
    region_list = region_series.tolist()
    
    # 8. 返回字典，Key 为新增列名
    return {
        "所属地区": region_list
    }
