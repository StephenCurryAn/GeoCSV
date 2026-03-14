import numpy as np
import pandas as pd
from shapely.geometry import box

def execute(df, parameters):
    """
    计算几何图形的多种指标。
    """
    # 1. 动态获取参数
    height_col_name = parameters.get('height_column')
    buffer_dist = float(parameters.get('buffer_distance', 50))  # 强制转换为浮点数

    # 2. 参数有效性检查
    if height_col_name not in df.columns:
        raise ValueError(f"高度列 '{height_col_name}' 在数据中不存在。")
    if buffer_dist <= 0:
        raise ValueError("缓冲区距离必须为正数。")

    # 3. 数据预处理：处理脏数据
    # 处理高度列：将无效值（0，空字符串，纯空格）替换为 NaN，并强制转换为数值
    df[height_col_name] = df[height_col_name].replace([0, '', r'^\s*$'], np.nan, regex=True)
    df[height_col_name] = pd.to_numeric(df[height_col_name], errors='coerce')

    # 4. 几何计算前，确保有有效的几何列
    if 'geometry' not in df.columns:
        raise ValueError("数据中必须包含 'geometry' 列。")
    if df.geometry.isnull().all():
        raise ValueError("几何列全部为空，无法进行计算。")

    # 5. 关键步骤：如果CRS是地理坐标系或未定义，必须先投影到UTM进行距离/面积计算
    original_crs = df.crs
    is_geographic = original_crs is None or original_crs.is_geographic
    if is_geographic:
        try:
            projected_gdf = df.to_crs(df.estimate_utm_crs())
        except Exception as e:
            print(f"警告：无法自动估算UTM投影，将尝试使用EPSG:3857进行近似计算。错误: {e}")
            projected_gdf = df.to_crs('EPSG:3857')  # Web Mercator 作为备选
    else:
        projected_gdf = df.copy()  # 如果已有投影坐标系，直接使用

    # 6. 计算核心指标（使用向量化操作，避免逐行循环）
    results = {}

    # 6.1 周长 (Perimeter) - 使用投影后的几何
    perimeter_series = projected_gdf.geometry.length
    results["Perimeter"] = perimeter_series.tolist()

    # 6.2 面积 (Area) - 使用投影后的几何
    area_series = projected_gdf.geometry.area
    results["Area"] = area_series.tolist()

    # 6.3 体积 (Volume) = 面积 * 高度
    # 注意：面积来自投影坐标系（平方米），高度单位需一致（假设为米）
    volume_series = area_series * df[height_col_name]
    results["Volume"] = volume_series.tolist()

    # 6.4 最小外接矩形面积 (Min_Bounding_Rect_Area)
    # 使用投影后的几何计算矩形面积
    def calc_mbr_area(geom):
        try:
            if geom.is_empty:
                return np.nan
            # 获取最小外接矩形
            mbr = geom.minimum_rotated_rectangle
            return mbr.area
        except Exception as e:
            print(f"计算最小外接矩形面积时出错: {e}")
            return np.nan

    mbr_area_series = projected_gdf.geometry.apply(calc_mbr_area)
    results["Min_Bounding_Rect_Area"] = mbr_area_series.tolist()

    # 6.5 50米缓冲区内的建筑物数量 (Buildings_Within_Buffer)
    # 此计算较耗时，但必须使用投影坐标系
    buildings_count_list = []
    try:
        # 创建缓冲区
        buffered_geoms = projected_gdf.geometry.buffer(buffer_dist)
        # 构建空间索引加速查询
        sindex = projected_gdf.sindex if hasattr(projected_gdf, 'sindex') else None
        
        for idx, buffer_geom in enumerate(buffered_geoms):
            try:
                if buffer_geom.is_empty:
                    buildings_count_list.append(0)
                    continue
                
                # 使用空间索引预筛选可能相交的要素
                possible_matches_index = list(sindex.intersection(buffer_geom.bounds)) if sindex else range(len(projected_gdf))
                
                count = 0
                for j in possible_matches_index:
                    # 排除自身
                    if idx == j:
                        continue
                    target_geom = projected_gdf.iloc[j].geometry
                    if target_geom.intersects(buffer_geom):
                        count += 1
                buildings_count_list.append(count)
            except Exception as e:
                print(f"计算第 {idx} 行的缓冲区建筑物数量时出错: {e}")
                buildings_count_list.append(np.nan)
    except Exception as e:
        print(f"创建缓冲区或构建空间索引时出错: {e}")
        # 如果出错，返回一列NaN
        buildings_count_list = [np.nan] * len(df)
    
    results["Buildings_Within_Buffer"] = buildings_count_list

    # 6.6 复杂度 (Complexity) = log(面积) / log(周长)
    # 添加小常数防止对0或负数取对数
    epsilon = 1e-10
    log_area = np.log(area_series + epsilon)
    log_perimeter = np.log(perimeter_series + epsilon)
    
    # 避免除零或无效值
    complexity_series = np.divide(log_area, log_perimeter, out=np.full_like(log_area, np.nan), where=log_perimeter != 0)
    results["Complexity"] = complexity_series.tolist()

    # 7. 返回结果字典
    # 确保每个结果列表的长度与原始df一致
    expected_len = len(df)
    for key, val_list in results.items():
        if len(val_list) != expected_len:
            print(f"警告: 结果列 '{key}' 的长度 ({len(val_list)}) 与输入数据长度 ({expected_len}) 不匹配。")
            # 填充或截断以匹配长度（通常不会发生，此处为安全处理）
            if len(val_list) < expected_len:
                val_list.extend([np.nan] * (expected_len - len(val_list)))
            else:
                val_list = val_list[:expected_len]
            results[key] = val_list

    return results