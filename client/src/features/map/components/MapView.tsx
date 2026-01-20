import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl'; 
import 'maplibre-gl/dist/maplibre-gl.css';
import { bbox, center } from '@turf/turf';// 用于计算数据的边界框

interface MapViewProps {
  data: any;        // GeoJSON 数据
  fileName: string; // 当前文件名
  // 🚨【新增】接收选中的属性
  selectedFeature?: any;
  // 🚨【新增】点击回调
  onFeatureClick?: (feature: any) => void;
}

const MapView: React.FC<MapViewProps> = ({ data, fileName, selectedFeature, onFeatureClick }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  // 🚨【新增】用于管理弹窗实例
  const popupRef = useRef<maplibregl.Popup | null>(null);
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
      // 🚨【修复点 1】组件卸载/热更新时，重置状态
      setIsMapLoaded(false);

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
    // 🚨【修复点 2】双重保险：如果没有 map 或者样式没加载完，直接退出
    // map.getStyle() 如果返回 undefined，说明样式还没准备好
    if (!map) return;
    // 🚨【修改这里】卫兵 2.0：不仅拦截，还负责自动重试
    // map.isStyleLoaded() 是 MapLibre 检查样式是否完成的方法
    if (!map.style || !map.isStyleLoaded()) {
        console.log('⚠️ 地图样式未就绪，已加入重试队列...');
        
        // 监听 'styledata' 事件：一旦样式加载动了一下，就立马重试一次
        map.once('styledata', () => {
            console.log('♻️ 样式已就绪，正在自动重试渲染...');
            renderGeoJSON(geoJSON);
        });
        return;
    }

    const sourceId = 'uploaded-geo-data';

    // A. 移除旧图层和数据源 (清理画布)
    // A. 清理旧图层 (增加清理高亮图层)
    const layersToRemove = ['geo-fill-layer', 'geo-line-layer', 'geo-highlight-fill', 'geo-highlight-line'];
    // if (map.getSource(sourceId)) {
    //     // 必须先移除引用该 Source 的 Layer
    //     if (map.getLayer('geo-fill-layer')) map.removeLayer('geo-fill-layer');
    //     if (map.getLayer('geo-line-layer')) map.removeLayer('geo-line-layer');
    //     map.removeSource(sourceId);
    // }
    layersToRemove.forEach(layer => {
        if (map.getLayer(layer)) map.removeLayer(layer);
    });
    if (map.getSource(sourceId)) map.removeSource(sourceId);

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

        // 🚨 3. 高亮填充层 (默认隐藏)
        // filter: ['==', 'id', ''] 初始不匹配任何东西
        map.addLayer({
            id: 'geo-highlight-fill',
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': '#00e5ff', // 高亮时颜色
                'fill-opacity': 0.6      // 高亮时更不透明
            },
            filter: ['==', 'id', 'nothing-selected'] 
        });

        // 🚨 4. 高亮边框层 (默认隐藏，发光白边)
        map.addLayer({
            id: 'geo-highlight-line',
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': '#ffffff', // 白色高亮边框
                'line-width': 3
            },
            filter: ['==', 'id', 'nothing-selected']
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

        // 🚨【核心新增】绑定点击事件！
        // 只有当图层存在时才绑定，避免报错
        if (map.getLayer('geo-fill-layer')) {
            
            // 1. 点击事件
            map.on('click', 'geo-fill-layer', (e) => {
                if (e.features && e.features.length > 0) {
                    const feature = e.features[0];
                    const props = feature.properties;
                    // 🛠️ 修复点 1: 处理被地图序列化为字符串的 cp 数组
                    // 例如: "[116.3, 31.8]" (String) -> [116.3, 31.8] (Array)
                    if (typeof props.cp === 'string') {
                        try {
                            props.cp = JSON.parse(props.cp);
                        } catch (err) {
                            console.warn('CP string parse failed:', props.cp);
                        }
                    }

                    // 🛠️ 修复点 2: 如果 cp 还是不存在或格式不对，使用 Turf 现场计算
                    // 这能保证所有多边形都能弹出框，哪怕数据里没写 cp
                    if (!props.cp || !Array.isArray(props.cp)) {
                        try {
                            const centerFeature = center(feature as any);
                            props.cp = centerFeature.geometry.coordinates; // [lng, lat]
                        } catch (err) {
                            console.warn('Center calculation failed, using click point');
                            props.cp = [e.lngLat.lng, e.lngLat.lat]; // 最后的兜底：鼠标位置
                        }
                    }
                    // 此时 props.cp 必定是一个合法的数组，传给父组件
                    // 💡 注意：MapLibre 有时会把 properties 里的 JSON 字符串化
                    // 如果你的 cp 是字符串形式 "[120, 30]"，需要 parse 一下
                    // 这里假设它还是对象，或者我们在 DataPivot 处理过
                    // 为了保险，我们直接把 props 传出去
                    if (onFeatureClick) {
                        onFeatureClick(props);
                    }
                }
            });

            // 2. 鼠标悬停变手型 (提升体验)
            map.on('mouseenter', 'geo-fill-layer', () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'geo-fill-layer', () => {
                map.getCanvas().style.cursor = '';
            });
        }

    } catch (err) {
        console.error('地图渲染 GeoJSON 失败:', err);
    }
  };

  // 🚨【新增 Effect】监听 selectedFeature，处理高亮和弹窗
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !isMapLoaded) return;

    // 1. 如果没有选中项，清理高亮和弹窗
    if (!selectedFeature) {
        if (map.getLayer('geo-highlight-fill')) map.setFilter('geo-highlight-fill', ['==', 'id', 'nothing']);
        if (map.getLayer('geo-highlight-line')) map.setFilter('geo-highlight-line', ['==', 'id', 'nothing']);
        popupRef.current?.remove();
        return;
    }

    // 2. 设置高亮过滤器
    // 优先使用 id，如果没有则尝试使用 name
    const uniqueKey = selectedFeature.id ? 'id' : 'name';
    const uniqueVal = selectedFeature.id || selectedFeature.name;

    if (uniqueVal) {
        if (map.getLayer('geo-highlight-fill')) map.setFilter('geo-highlight-fill', ['==', uniqueKey, uniqueVal]);
        if (map.getLayer('geo-highlight-line')) map.setFilter('geo-highlight-line', ['==', uniqueKey, uniqueVal]);
    }

    // 3. 处理弹窗 (Popup)
    // 🚨 这里的 cp 现在肯定是数组了，因为我们在 click 事件里修复了它
    let centerCoord: [number, number] | null = null;
    // 使用数据自带的 cp (center point) 字段
    if (selectedFeature.cp && Array.isArray(selectedFeature.cp)) {
        centerCoord = selectedFeature.cp as [number, number];
    }

    if (centerCoord) {
        // 移除旧弹窗
        popupRef.current?.remove();

        // 生成弹窗内容 HTML (过滤掉不想显示的内部字段)
        const ignoreKeys = ['_geometry', 'cp', 'childNum', 'center', '_geometry_type'];
        const rowsHtml = Object.entries(selectedFeature)
            .filter(([key]) => !ignoreKeys.includes(key) && typeof key === 'string')
            .map(([key, val]) => `
                <div class="flex justify-between py-1 border-b border-gray-700 last:border-0">
                    <span class="text-gray-400 font-mono text-xs uppercase">${key}</span>
                    <span class="text-cyan-400 font-bold text-xs ml-4 text-right">${val}</span>
                </div>
            `).join('');

        const popupContent = `
            <div class="min-w-50">
                <div class="text-sm font-bold text-white mb-2 pb-1 border-b border-cyan-500 flex items-center">
                    <span class="w-2 h-2 rounded-full bg-cyan-400 mr-2 shadow-[0_0_8px_#00e5ff]"></span>
                    ${selectedFeature.name || 'Feature Details'}
                </div>
                <div>${rowsHtml}</div>
            </div>
        `;

        // 创建自定义样式的弹窗
        popupRef.current = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: false,
            className: 'dark-cool-popup', // 对应下面的 CSS 类名
            maxWidth: '300px',
            offset: 15
        })
        .setLngLat(centerCoord)
        .setHTML(popupContent)
        .addTo(map);

        // 飞到该位置
        map.flyTo({ center: centerCoord, zoom: 8, speed: 1.5 });
    }

  }, [selectedFeature, isMapLoaded]);

  return (
    <div className="w-full h-full relative">
      {/* 地图容器 */}
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* 🚨【新增】注入 CSS 样式：自定义黑色炫酷弹窗 */}
      <style>{`
        /* 弹窗容器背景 */
        .dark-cool-popup .maplibregl-popup-content {
            background: rgba(17, 24, 39, 0.95) !important; /* bg-gray-900 */
            border: 1px solid #06b6d4; /* cyan-500 */
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 0 15px rgba(6, 182, 212, 0.4); /* 发光阴影 */
            backdrop-filter: blur(4px);
        }
        
        /* 弹窗小箭头 */
        .dark-cool-popup .maplibregl-popup-tip {
            border-top-color: #06b6d4 !important;
            border-bottom-color: #06b6d4 !important;
        }

        /* 关闭按钮 */
        .dark-cool-popup .maplibregl-popup-close-button {
            color: #22d3ee;
            font-size: 16px;
            outline: none;
            padding-right: 6px;
            padding-top: 6px;
        }
        .dark-cool-popup .maplibregl-popup-close-button:hover {
            color: white;
            background: transparent;
        }
      `}</style>

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