import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl'; 
import 'maplibre-gl/dist/maplibre-gl.css';
import { bbox } from '@turf/turf';// 用于计算数据的边界框

interface MapViewProps {
  data: any;        // GeoJSON 数据
  fileName: string; // 当前文件名
}

const MapView: React.FC<MapViewProps> = ({ data, fileName }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // 1. 初始化地图
  useEffect(() => {
    if (mapInstance.current) return; // 防止重复初始化

    if (mapContainer.current) {
      mapInstance.current = new maplibregl.Map({
        container: mapContainer.current,
        // 使用 CartoDB Dark Matter 黑色底图 (无需 Key，免费且炫酷)
        style: {
            version: 8,
            sources: {
                'carto-dark': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; OpenStreetMap &copy; CARTO'
                }
            },
            layers: [
                {
                    id: 'carto-dark-layer',
                    type: 'raster',
                    source: 'carto-dark',
                    minzoom: 0,
                    maxzoom: 22
                }
            ]
        },
        center: [118.7969, 32.0603], // 默认中心点 (南京)
        zoom: 7
      });

      // 监听地图加载完成事件
      mapInstance.current.on('load', () => {
        console.log('✅ 地图加载完成');
        setIsMapLoaded(true);
        // 🚨【关键修复】强制地图重新计算大小，防止在 Flex 布局中高度为 0
        mapInstance.current?.resize();
      });
    }

    // 组件卸载时销毁地图
    // 🚨【关键修复】组件卸载时不仅要 remove，还要置空！
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null; // 👈 必须加这一行！
      }
    };
  }, []);

  // 2. 监听数据变化，渲染图层
  useEffect(() => {
    if (isMapLoaded && data) {
      renderGeoJSON(data);
    }
  }, [data, isMapLoaded]); // 当 data 或地图加载状态变化时触发

  /**
   * 核心渲染逻辑
   */
  const renderGeoJSON = (geoJSON: any) => {
    const map = mapInstance.current;
    if (!map) return;

    const sourceId = 'uploaded-geo-data';

    // A. 移除旧图层和数据源 (清理画布)
    if (map.getSource(sourceId)) {
        // 必须先移除引用该 Source 的 Layer
        if (map.getLayer('geo-fill-layer')) map.removeLayer('geo-fill-layer');
        if (map.getLayer('geo-line-layer')) map.removeLayer('geo-line-layer');
        map.removeSource(sourceId);
    }

    // B. 添加新数据源
    try {
        map.addSource(sourceId, {
            type: 'geojson',
            data: geoJSON
        });

        // C. 添加样式图层
        // 1. 填充层 (半透明青色)
        map.addLayer({
            id: 'geo-fill-layer',
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': '#00e5ff', // 炫酷的青色 (Cyan)
                'fill-opacity': 0.3      // 半透明
            }
        });

        // 2. 边框层 (高亮边框)
        map.addLayer({
            id: 'geo-line-layer',
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': '#00e5ff', // 同色系
                'line-width': 2,         // 线宽
                'line-opacity': 1
            }
        });

        // D. 自动聚焦 (Fit Bounds)
        // 使用 turf/bbox 计算 GeoJSON 的边界框 [minX, minY, maxX, maxY]
        const bounds = bbox(geoJSON) as [number, number, number, number];
        
        // 飞到数据位置
        map.fitBounds(bounds, {
            padding: 50,  // 留一点边距
            maxZoom: 14,  // 防止点数据缩放太大
            duration: 2000 // 飞行动画时长 (2秒)
        });

    } catch (err) {
        console.error('地图渲染 GeoJSON 失败:', err);
    }
  };

  return (
    <div className="w-full h-full relative">
      {/* 地图容器 */}
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* 悬浮的文件名提示 */}
      {fileName && (
        <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md text-cyan-400 px-3 py-1 rounded border border-cyan-500/30 text-xs font-mono z-10">
          VISUALIZING: {fileName}
        </div>
      )}
    </div>
  );
};

export default MapView;