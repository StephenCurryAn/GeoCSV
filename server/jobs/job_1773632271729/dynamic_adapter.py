import os
import json
import pandas as pd
import geopandas as gpd

input_path = "/data/input/raw_dataset.geojson"
params_path = "/data/input/params.json"
output_path = "/data/output/adapted_data.geojson"

os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(params_path, 'r') as f:
    params = json.load(f)

gdf = gpd.read_file(input_path)

if isinstance(params, dict) and params:
    for key, value in params.items():
        if isinstance(value, (int, float, str)):
            gdf[key] = value
else:
    gdf = gdf.copy()

gdf.to_file(output_path, driver='GeoJSON')