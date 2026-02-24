# python_engine/models/lsi_ahp.py
import pandas as pd

def execute(df: pd.DataFrame, params: dict) -> list:
    """计算 AHP 滑坡易发性指数"""
    slope_col = params.get('slope_col', 'slope')
    elev_col = params.get('elevation_col', 'elevation')
    rain_col = params.get('rainfall_col', 'rainfall')
    
    weights = params.get('weights', {"slope": 0.45, "elevation": 0.35, "rainfall": 0.20})

    for col in [slope_col, elev_col, rain_col]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        else:
            raise ValueError(f"数据中缺少必要的列: {col}")

    lsi_score = (
        df[slope_col] * weights['slope'] + 
        df[elev_col] * weights['elevation'] + 
        df[rain_col] * weights['rainfall']
    )
    return lsi_score.tolist()