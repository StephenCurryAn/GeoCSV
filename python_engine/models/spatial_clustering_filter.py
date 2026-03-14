import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN

def execute(df, parameters):
    """
    1. 筛选目标列大于阈值的要素。
    2. 对筛选出的要素进行DBSCAN空间聚类。
    3. 为所有原始要素生成聚类标签（筛选出的为聚类ID，未筛选出的为-1）。
    """
    # 1. 动态获取参数
    target_col_name = parameters.get('target_column')
    threshold_val = parameters.get('threshold')
    eps_val = parameters.get('eps', 1000)
    min_samples_val = parameters.get('min_samples', 5)

    # 2. 参数校验
    if target_col_name not in df.columns:
        raise ValueError(f"目标列 '{target_col_name}' 不存在于数据中。")
    try:
        threshold_val = float(threshold_val)
        eps_val = float(eps_val)
        min_samples_val = int(min_samples_val)
    except (ValueError, TypeError) as e:
        raise ValueError(f"参数类型转换失败: {e}")

    # 3. 数据预处理：处理脏数据并转换为数值
    # 替换无效值为NaN
    df[target_col_name] = df[target_col_name].replace([0, '', r'^\s*$'], np.nan, regex=True)
    # 强制转换为数值，非数值变为NaN
    target_series_numeric = pd.to_numeric(df[target_col_name], errors='coerce')

    # 4. 筛选逻辑（向量化操作）
    # 创建筛选掩码：数值大于阈值且非NaN
    filter_mask = (target_series_numeric > threshold_val) & (target_series_numeric.notna())
    filtered_gdf = df.loc[filter_mask].copy()
    
    # 5. 检查筛选结果
    if len(filtered_gdf) == 0:
        print("警告: 没有要素满足筛选条件。所有要素的聚类标签将被标记为-1。")
        # 返回一个全为-1的列表，长度与原始df一致
        return {"Cluster_ID": [-1] * len(df)}
    
    # 6. 空间聚类（DBSCAN）
    # 获取筛选后要素的几何中心点坐标
    # 注意：DBSCAN需要二维坐标数组
    # 首先确保几何类型是点，如果不是，取其质心
    if not all(filtered_gdf.geometry.type.isin(['Point', 'MultiPoint'])):
        # 非点几何，计算质心
        filtered_gdf = filtered_gdf.copy()
        filtered_gdf['geometry'] = filtered_gdf.geometry.centroid
        print("提示: 非点几何要素已使用其质心进行聚类。")
    
    # 提取坐标
    # 先投影到UTM坐标系（以米为单位）用于距离计算
    try:
        utm_crs = filtered_gdf.estimate_utm_crs()
        projected_gdf = filtered_gdf.to_crs(utm_crs)
        coords = np.column_stack((projected_gdf.geometry.x, projected_gdf.geometry.y))
    except Exception as e:
        print(f"警告: 无法估计或转换到UTM CRS，将使用原始坐标（单位：度）。距离参数'eps'的单位也应为度。错误: {e}")
        coords = np.column_stack((filtered_gdf.geometry.x, filtered_gdf.geometry.y))
    
    # 执行DBSCAN聚类
    try:
        clustering = DBSCAN(eps=eps_val, min_samples=min_samples_val).fit(coords)
        cluster_labels = clustering.labels_
        # DBSCAN中噪声点标记为-1
    except Exception as e:
        print(f"DBSCAN聚类失败: {e}")
        # 聚类失败，为筛选出的所有要素分配标签-1
        cluster_labels = np.full(len(filtered_gdf), -1)
    
    # 7. 将聚类标签映射回原始DataFrame
    # 初始化一个全为-1的Series，长度与原始df一致，dtype为object以兼容整数和NaN
    final_cluster_series = pd.Series(np.nan, index=df.index, dtype=object)
    # 将筛选出的要素的聚类标签填入对应位置
    final_cluster_series.loc[filter_mask] = cluster_labels
    # 将NaN（即未筛选出的要素）填充为-1
    final_cluster_series = final_cluster_series.fillna(-1)
    # 确保最终类型为整数（或-1）
    final_cluster_series = final_cluster_series.astype(int)
    
    # 8. 返回结果
    return {"Cluster_ID": final_cluster_series.tolist()}
