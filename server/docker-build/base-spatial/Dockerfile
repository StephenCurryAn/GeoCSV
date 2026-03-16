FROM osgeo/gdal:ubuntu-small-3.4.0

RUN apt-get update && apt-get install -y python3-pip

RUN pip3 config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

RUN pip3 install --no-cache-dir pandas geopandas shapely rasterio pyproj networkx "fiona<1.9.0"

WORKDIR /app
