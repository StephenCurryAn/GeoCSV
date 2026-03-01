import pandas as pd
import numpy as np
import geopandas as gpd
from shapely.geometry import LineString, Point

def execute(df, parameters):
    try:
        # 确保是GeoDataFrame
        if not isinstance(df, gpd.GeoDataFrame):
            raise ValueError("输入数据不是GeoDataFrame")
        
        # 检查geometry列是否存在且为线类型
        if 'geometry' not in df.columns:
            raise ValueError("GeoDataFrame中缺少'geometry'列")
        
        # 初始化结果列表
        angles = []
        
        for geom in df.geometry:
            if geom is None or geom.is_empty:
                angles.append(np.nan)
                continue
            
            # 确保是LineString或LinearRing
            if geom.geom_type not in ('LineString', 'LinearRing'):
                # 尝试获取第一个线部分（对于MultiLineString）
                if geom.geom_type == 'MultiLineString':
                    if len(geom.geoms) > 0:
                        geom = geom.geoms[0]
                    else:
                        angles.append(np.nan)
                        continue
                else:
                    angles.append(np.nan)
                    continue
            
            # 获取起点和终点
            coords = list(geom.coords)
            if len(coords) < 2:
                angles.append(np.nan)
                continue
            
            start = Point(coords[0])
            end = Point(coords[-1])
            
            # 计算经度差和纬度差（注意：EPSG:4326，x=经度，y=纬度）
            dx = end.x - start.x
            dy = end.y - start.y
            
            # 计算角度（弧度），atan2(dx, dy) 因为正北是dy正方向
            # atan2(dx, dy) 返回从正北（dy正轴）顺时针到向量的角度
            rad = np.arctan2(dx, dy)
            
            # 转换为度（0-360）
            deg = np.degrees(rad)
            if deg < 0:
                deg += 360.0
            
            angles.append(deg)
        
        return angles
    except Exception as e:
        raise ValueError(f"模型计算出错: {str(e)}")