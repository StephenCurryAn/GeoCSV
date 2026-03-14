import geopandas as gpd
import pandas as pd
import numpy as np

def execute(df, parameters):
    """
    计算GeoDataFrame中每个几何要素的面积（平方米）。
    如果原始CRS是地理坐标系，会自动转换为合适的UTM投影。
    """
    # 1. 检查输入是否为有效的GeoDataFrame
    if not isinstance(df, gpd.GeoDataFrame):
        raise ValueError("输入数据必须是一个GeoDataFrame。")
    if df.geometry is None or df.geometry.empty:
        raise ValueError("GeoDataFrame中不包含有效的几何列。")
    
    # 2. 复制一份数据以避免修改原始数据
    result_df = df.copy()
    
    # 3. 检查并转换坐标系以进行面积计算
    # 如果CRS未定义或是地理坐标系（单位是度），则转换为UTM投影
    if result_df.crs is None or result_df.crs.is_geographic:
        try:
            # 估算合适的UTM投影
            utm_crs = result_df.estimate_utm_crs()
            projected_gdf = result_df.to_crs(utm_crs)
            # 计算面积（单位为平方米）
            area_series = projected_gdf.geometry.area
        except Exception as e:
            # 如果转换失败，尝试使用等面积投影（如World Eckert IV）作为备选
            print(f"UTM投影转换失败，错误: {e}。尝试使用等面积投影。")
            try:
                # 使用一个常见的全球等面积投影
                projected_gdf = result_df.to_crs('ESRI:54012')  # World Eckert IV
                area_series = projected_gdf.geometry.area  # 单位是平方米
            except Exception as e2:
                # 如果再次失败，则抛出错误
                raise ValueError(f"无法将数据转换为合适的投影坐标系以计算面积。错误: {e2}")
    else:
        # CRS已经是投影坐标系，直接计算面积
        # 注意：此时面积单位取决于CRS的定义（可能是米、英尺等）
        area_series = result_df.geometry.area
    
    # 4. 将面积序列转换为Python列表，确保长度与原始df一致
    area_list = area_series.tolist()
    
    # 5. 返回结果字典
    return {"AREA_M2": area_list}
