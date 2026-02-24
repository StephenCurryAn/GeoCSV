# python_engine/models/kmeans.py
import pandas as pd
from sklearn.cluster import KMeans

def execute(df: pd.DataFrame, params: dict) -> list:
    """K-Means 聚类模型"""
    n_clusters = int(params.get("n_clusters", 3))
    
    # 清洗数据：只保留数值列，并填补空值
    numeric_df = df.select_dtypes(include=['number']).fillna(0)
    
    if numeric_df.empty:
         raise ValueError("没有有效的数值列可以参与聚类")

    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    clusters = kmeans.fit_predict(numeric_df)
    
    return clusters.tolist()