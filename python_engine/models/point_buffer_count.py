import pandas as pd
import numpy as np
import geopandas as gpd
from shapely.geometry import Point

def execute(df, parameters):
    """
    计算每个点要素在指定半径（米）的圆形缓冲区内，其他点要素的数量。
    """
    # 1. 参数提取与验证
    radius = parameters.get('buffer_radius')
    if radius is None:
        raise ValueError("参数 'buffer_radius' 未提供。")
    try:
        radius = float(radius)
    except (ValueError, TypeError):
        raise ValueError(f"参数 'buffer_radius' 的值 '{radius}' 无法转换为有效的浮点数。")
    if radius <= 0:
        raise ValueError("缓冲区半径必须大于0。")
    
    # 2. 数据验证
    if not isinstance(df, gpd.GeoDataFrame):
        raise ValueError("输入数据必须是一个GeoDataFrame。")
    if df.geometry.isnull().any():
        raise ValueError("输入数据中存在空的几何图形，请先处理。")
    if not all(df.geometry.type == 'Point'):
        raise ValueError("所有几何图形必须为点类型(Point)。")
    
    # 3. 几何投影转换（关键步骤）
    # 如果CRS是地理坐标系（度）或未定义，则转换为UTM投影（米）
    original_crs = df.crs
    if original_crs is None or original_crs.is_geographic:
        try:
            utm_crs = df.estimate_utm_crs()
            projected_gdf = df.to_crs(utm_crs)
        except Exception as e:
            # 如果无法估计UTM，使用一个通用的等距投影（如Web Mercator）作为备选，但注意其距离失真
            print(f"警告: 无法估计UTM CRS，使用EPSG:3857进行近似距离计算。误差可能较大。错误: {e}")
            projected_gdf = df.to_crs('EPSG:3857')
    else:
        # 如果已有投影，且单位是米，则直接使用
        projected_gdf = df
    
    # 4. 核心计算：使用空间连接（sjoin）进行缓冲区计数
    # 为每个点创建缓冲区
    projected_gdf['buffer'] = projected_gdf.geometry.buffer(radius)
    # 临时将缓冲区设为几何列进行空间连接
    temp_buffer_gdf = gpd.GeoDataFrame(projected_gdf, geometry='buffer', crs=projected_gdf.crs)
    # 空间连接：查找每个缓冲区内的所有点（包括自身）
    joined = gpd.sjoin(temp_buffer_gdf, projected_gdf, how='left', predicate='contains')
    # 按原始点索引分组，统计每个缓冲区内的点数量
    # 'index_right' 是连接到的点的索引
    count_series = joined.groupby(joined.index).size()
    # 由于连接包含自身，所以数量至少为1，我们需要的是“其他点”的数量，所以减1
    other_point_counts = count_series - 1
    # 确保结果序列的索引与原始df完全对齐，缺失的索引（理论上不应发生）填充为0
    other_point_counts = other_point_counts.reindex(df.index, fill_value=0)
    
    # 5. 返回结果
    # 结果列名：'Buffer_Count'
    return {"Buffer_Count": other_point_counts.tolist()}
