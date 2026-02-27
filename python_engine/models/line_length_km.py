import geopandas as gpd
import numpy as np

def execute(df, parameters):
    try:
        # 检查是否为GeoDataFrame且包含几何列
        if not isinstance(df, gpd.GeoDataFrame):
            raise ValueError("输入数据不是GeoDataFrame，无法进行空间计算。")
        if df.geometry is None:
            raise ValueError("输入数据不包含几何列。")
        
        # 投影到EPSG:3857（单位：米）
        projected_df = df.to_crs(epsg=3857)
        
        # 计算长度（米）并转换为千米，保留两位小数
        lengths_m = projected_df.geometry.length
        lengths_km = np.round(lengths_m / 1000.0, 2)
        
        return lengths_km.tolist()
    except Exception as e:
        raise ValueError(f"模型计算出错: {str(e)}")