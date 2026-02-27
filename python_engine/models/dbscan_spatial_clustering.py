import pandas as pd
import numpy as np
import geopandas as gpd
from sklearn.cluster import DBSCAN

def execute(df, parameters):
    try:
        # 提取要素中心点经纬度（EPSG:4326）
        centroids = df.geometry.centroid
        coords = np.array([[p.x, p.y] for p in centroids])
        
        # 获取DBSCAN参数
        eps = parameters.get('eps', 0.2)
        min_samples = parameters.get('min_samples', 50)
        
        # 执行DBSCAN聚类
        dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric='euclidean')
        labels = dbscan.fit_predict(coords)
        
        # 返回标签列表（噪声点标签为-1）
        return labels.tolist()
    except Exception as e:
        raise ValueError(f"模型计算出错: {str(e)}")