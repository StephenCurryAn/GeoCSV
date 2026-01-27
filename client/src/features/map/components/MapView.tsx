// import React, { useEffect, useRef, useState } from 'react';
// import * as maplibregl from 'maplibre-gl'; 
// import 'maplibre-gl/dist/maplibre-gl.css';
// import { bbox, center } from '@turf/turf';// 用于计算数据的边界框

// interface MapViewProps {
//   data: any;        // GeoJSON 数据
//   fileName: string; // 当前文件名
//   // 🚨【新增】接收选中的属性
//   selectedFeature?: any;
//   // 🚨【新增】点击回调
//   onFeatureClick?: (feature: any) => void;
// }

// const MapView: React.FC<MapViewProps> = ({ data, fileName, selectedFeature, onFeatureClick }) => {
//   const mapContainer = useRef<HTMLDivElement>(null);
//   const mapInstance = useRef<maplibregl.Map | null>(null);
//   // 🚨【新增】用于管理弹窗实例
//   const popupRef = useRef<maplibregl.Popup | null>(null);
//   const [isMapLoaded, setIsMapLoaded] = useState(false);

//   // 1. 初始化地图
//   useEffect(() => {
//     if (mapInstance.current) return; // 防止重复初始化

//     if (mapContainer.current) {
//       mapInstance.current = new maplibregl.Map({
//         container: mapContainer.current,
//         // 使用 CartoDB Dark Matter 黑色底图 (无需 Key，免费且炫酷)
//         style: {
//             version: 8,
//             sources: {
//                 'carto-dark': {
//                     type: 'raster',
//                     tiles: [
//                         'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
//                         'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
//                         'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
//                         'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
//                     ],
//                     tileSize: 256,
//                     attribution: '&copy; OpenStreetMap &copy; CARTO'
//                 }
//             },
//             layers: [
//                 {
//                     id: 'carto-dark-layer',
//                     type: 'raster',
//                     source: 'carto-dark',
//                     minzoom: 0,
//                     maxzoom: 22
//                 }
//             ]
//         },
//         center: [118.7969, 32.0603], // 默认中心点 (南京)
//         zoom: 7
//       });

//       // 监听地图加载完成事件
//       mapInstance.current.on('load', () => {
//         console.log('✅ 地图加载完成');
//         setIsMapLoaded(true);
//         // 🚨【关键修复】强制地图重新计算大小，防止在 Flex 布局中高度为 0
//         mapInstance.current?.resize();
//       });
//     }

//     // 组件卸载时销毁地图
//     // 🚨【关键修复】组件卸载时不仅要 remove，还要置空！
//     return () => {
//       // 🚨【修复点 1】组件卸载/热更新时，重置状态
//       setIsMapLoaded(false);

//       if (mapInstance.current) {
//         mapInstance.current.remove();
//         mapInstance.current = null; // 👈 必须加这一行！
//       }
//     };
//   }, []);

//   // 2. 监听数据变化，渲染图层
//   useEffect(() => {
//     if (isMapLoaded && data) {
//       renderGeoJSON(data);
//     }
//   }, [data, isMapLoaded]); // 当 data 或地图加载状态变化时触发

//   /**
//    * 核心渲染逻辑
//    */
//   const renderGeoJSON = (geoJSON: any) => {
//     const map = mapInstance.current;
//     // 🚨【修复点 2】双重保险：如果没有 map 或者样式没加载完，直接退出
//     // map.getStyle() 如果返回 undefined，说明样式还没准备好
//     if (!map) return;
//     // 🚨【修改这里】卫兵 2.0：不仅拦截，还负责自动重试
//     // map.isStyleLoaded() 是 MapLibre 检查样式是否完成的方法
//     if (!map.style || !map.isStyleLoaded()) {
//         console.log('⚠️ 地图样式未就绪，已加入重试队列...');
        
//         // 监听 'styledata' 事件：一旦样式加载动了一下，就立马重试一次
//         map.once('styledata', () => {
//             console.log('♻️ 样式已就绪，正在自动重试渲染...');
//             renderGeoJSON(geoJSON);
//         });
//         return;
//     }

//     const sourceId = 'uploaded-geo-data';

//     // A. 移除旧图层和数据源 (清理画布)
//     // A. 清理旧图层 (增加清理高亮图层)
//     const layersToRemove = ['geo-point-layer','geo-highlight-point',
//         'geo-fill-layer', 'geo-line-layer', 'geo-highlight-fill', 'geo-highlight-line'];
//     // if (map.getSource(sourceId)) {
//     //     // 必须先移除引用该 Source 的 Layer
//     //     if (map.getLayer('geo-fill-layer')) map.removeLayer('geo-fill-layer');
//     //     if (map.getLayer('geo-line-layer')) map.removeLayer('geo-line-layer');
//     //     map.removeSource(sourceId);
//     // }
//     layersToRemove.forEach(layer => {
//         if (map.getLayer(layer)) map.removeLayer(layer);
//     });
//     if (map.getSource(sourceId)) map.removeSource(sourceId);

//     // B. 添加新数据源
//     try {
//         map.addSource(sourceId, {
//             type: 'geojson',
//             data: geoJSON
//         });
        
//         // ------------------------------------------------------------
//         // 🚨【核心新增】1. 添加点图层 (专门渲染 Point 类型)
//         // ------------------------------------------------------------
//         map.addLayer({
//             id: 'geo-point-layer',
//             type: 'circle',         // 使用圆点渲染
//             source: sourceId,
//             filter: ['==', '$type', 'Point'], // 只渲染几何类型为 Point 的数据
//             paint: {
//                 'circle-radius': 6,             // 半径：6px
//                 'circle-color': '#00e5ff',      // 颜色：荧光青 (配合你的主题)
//                 'circle-opacity': 0.8,          // 透明度
//                 'circle-stroke-width': 2,       // 描边宽度
//                 'circle-stroke-color': '#ffffff'// 描边颜色：白色 (在黑底上对比度最高)
//             }
//         });

//         // ------------------------------------------------------------
//         // 🚨【核心新增】2. 添加点的高亮图层
//         // ------------------------------------------------------------
//         map.addLayer({
//             id: 'geo-highlight-point',
//             type: 'circle',
//             source: sourceId,
//             filter: ['==', 'id', 'nothing-selected'], // 初始隐藏
//             paint: {
//                 'circle-radius': 9,             // 选中变大
//                 'circle-color': '#00e5ff',      
//                 'circle-opacity': 1,
//                 'circle-stroke-width': 3,
//                 'circle-stroke-color': '#ffffff',
//                 // 可选：加一点模糊模拟发光效果
//                 // 'circle-blur': 0.2
//             }
//         });

//         // C. 添加样式图层
//         // 1. 填充层 (半透明青色)
//         map.addLayer({
//             id: 'geo-fill-layer',
//             type: 'fill',
//             source: sourceId,
//             paint: {
//                 'fill-color': '#00e5ff', // 炫酷的青色 (Cyan)
//                 'fill-opacity': 0.3      // 半透明
//             }
//         });

//         // 2. 边框层 (高亮边框)
//         map.addLayer({
//             id: 'geo-line-layer',
//             type: 'line',
//             source: sourceId,
//             paint: {
//                 'line-color': '#00e5ff', // 同色系
//                 'line-width': 2,         // 线宽
//                 'line-opacity': 1
//             }
//         });

//         // 🚨 3. 高亮填充层 (默认隐藏)
//         // filter: ['==', 'id', ''] 初始不匹配任何东西
//         map.addLayer({
//             id: 'geo-highlight-fill',
//             type: 'fill',
//             source: sourceId,
//             paint: {
//                 'fill-color': '#00e5ff', // 高亮时颜色
//                 'fill-opacity': 0.6      // 高亮时更不透明
//             },
//             filter: ['==', 'id', 'nothing-selected'] 
//         });

//         // 🚨 4. 高亮边框层 (默认隐藏，发光白边)
//         map.addLayer({
//             id: 'geo-highlight-line',
//             type: 'line',
//             source: sourceId,
//             paint: {
//                 'line-color': '#ffffff', // 白色高亮边框
//                 'line-width': 3
//             },
//             filter: ['==', 'id', 'nothing-selected']
//         });

//         // D. 自动聚焦 (Fit Bounds)
//         // 使用 turf/bbox 计算 GeoJSON 的边界框 [minX, minY, maxX, maxY]
//         const bounds = bbox(geoJSON) as [number, number, number, number];
        
//         // 飞到数据位置
//         map.fitBounds(bounds, {
//             padding: 50,  // 留一点边距
//             maxZoom: 14,  // 防止点数据缩放太大
//             duration: 2000 // 飞行动画时长 (2秒)
//         });

//         // ------------------------------------------------------------
//         // 🚨【修改交互逻辑】让点也能被点击
//         // ------------------------------------------------------------
//         // 定义一个通用的点击处理函数
//         const handleFeatureClick = (e: any) => {
//             if (e.features && e.features.length > 0) {
//                 const feature = e.features[0];
//                 const props = feature.properties;
                
//                 // ... (保留你原有的 cp 处理逻辑: parse JSON, turf center 等) ...
//                 if (typeof props.cp === 'string') {
//                     try { props.cp = JSON.parse(props.cp); } catch (err) { console.warn('CP parse fail'); }
//                 }
                
//                 // 针对点的特殊处理：点的中心就是它坐标本身
//                 if (feature.geometry.type === 'Point') {
//                     props.cp = feature.geometry.coordinates;
//                 } else if (!props.cp || !Array.isArray(props.cp)) {
//                     // ... (保留 turf center 逻辑)
//                     try {
//                          // 这里需要引入 turf 的 center
//                          // const centerFeature = center(feature);
//                          // props.cp = centerFeature.geometry.coordinates;
//                          // 如果上面报错，直接用鼠标位置兜底
//                          props.cp = [e.lngLat.lng, e.lngLat.lat];
//                     } catch(err) {
//                         props.cp = [e.lngLat.lng, e.lngLat.lat];
//                     }
//                 }

//                 if (onFeatureClick) {
//                     onFeatureClick(props);
//                 }
//             }
//         };

//         // 🚨【核心新增】绑定点击事件！
//         // 只有当图层存在时才绑定，避免报错
//         if (map.getLayer('geo-fill-layer')) {
            
//             // 1. 点击事件
//             map.on('click', 'geo-fill-layer', (e) => {
//                 if (e.features && e.features.length > 0) {
//                     const feature = e.features[0];
//                     const props = feature.properties;
//                     // 🛠️ 修复点 1: 处理被地图序列化为字符串的 cp 数组
//                     // 例如: "[116.3, 31.8]" (String) -> [116.3, 31.8] (Array)
//                     if (typeof props.cp === 'string') {
//                         try {
//                             props.cp = JSON.parse(props.cp);
//                         } catch (err) {
//                             console.warn('CP string parse failed:', props.cp);
//                         }
//                     }

//                     // 🛠️ 修复点 2: 如果 cp 还是不存在或格式不对，使用 Turf 现场计算
//                     // 这能保证所有多边形都能弹出框，哪怕数据里没写 cp
//                     if (!props.cp || !Array.isArray(props.cp)) {
//                         try {
//                             const centerFeature = center(feature as any);
//                             props.cp = centerFeature.geometry.coordinates; // [lng, lat]
//                         } catch (err) {
//                             console.warn('Center calculation failed, using click point');
//                             props.cp = [e.lngLat.lng, e.lngLat.lat]; // 最后的兜底：鼠标位置
//                         }
//                     }
//                     // 此时 props.cp 必定是一个合法的数组，传给父组件
//                     // 💡 注意：MapLibre 有时会把 properties 里的 JSON 字符串化
//                     // 如果你的 cp 是字符串形式 "[120, 30]"，需要 parse 一下
//                     // 这里假设它还是对象，或者我们在 DataPivot 处理过
//                     // 为了保险，我们直接把 props 传出去
//                     if (onFeatureClick) {
//                         onFeatureClick(props);
//                     }
//                 }
//             });

//             // 2. 鼠标悬停变手型 (提升体验)
//             map.on('mouseenter', 'geo-fill-layer', () => {
//                 map.getCanvas().style.cursor = 'pointer';
//             });
//             map.on('mouseleave', 'geo-fill-layer', () => {
//                 map.getCanvas().style.cursor = '';
//             });
//         }

//         // 🚨 新增：给点图层绑定事件
//         if (map.getLayer('geo-point-layer')) {
//             map.on('click', 'geo-point-layer', handleFeatureClick);
//             map.on('mouseenter', 'geo-point-layer', () => map.getCanvas().style.cursor = 'pointer');
//             map.on('mouseleave', 'geo-point-layer', () => map.getCanvas().style.cursor = '');
//         }


//     } catch (err) {
//         console.error('地图渲染 GeoJSON 失败:', err);
//     }
//   };

//   // 🚨【新增 Effect】监听 selectedFeature，处理高亮和弹窗
//   useEffect(() => {
//     const map = mapInstance.current;
//     if (!map || !isMapLoaded) return;

//     // 1. 如果没有选中项，清理高亮和弹窗
//     if (!selectedFeature) {
//         if (map.getLayer('geo-highlight-fill')) map.setFilter('geo-highlight-fill', ['==', 'id', 'nothing']);
//         if (map.getLayer('geo-highlight-line')) map.setFilter('geo-highlight-line', ['==', 'id', 'nothing']);
//         // 🚨 新增清理点高亮
//         if (map.getLayer('geo-highlight-point')) map.setFilter('geo-highlight-point', ['==', 'id', 'nothing']);
        
//         popupRef.current?.remove();
//         return;
//     }

//     // 2. 设置高亮过滤器
//     // 优先使用 id，如果没有则尝试使用 name
//     const uniqueKey = selectedFeature.id ? 'id' : 'name';
//     const uniqueVal = selectedFeature.id || selectedFeature.name;

//     if (uniqueVal) {
//         if (map.getLayer('geo-highlight-fill')) map.setFilter('geo-highlight-fill', ['==', uniqueKey, uniqueVal]);
//         if (map.getLayer('geo-highlight-line')) map.setFilter('geo-highlight-line', ['==', uniqueKey, uniqueVal]);
//         // 🚨 新增设置点高亮
//         if (map.getLayer('geo-highlight-point')) map.setFilter('geo-highlight-point', ['==', uniqueKey, uniqueVal]);
//     }

//     // 3. 处理弹窗 (Popup)
//     // 🚨 这里的 cp 现在肯定是数组了，因为我们在 click 事件里修复了它
//     let centerCoord: [number, number] | null = null;
//     // 使用数据自带的 cp (center point) 字段
//     if (selectedFeature.cp && Array.isArray(selectedFeature.cp)) {
//         centerCoord = selectedFeature.cp as [number, number];
//     }

//     if (centerCoord) {
//         // 移除旧弹窗
//         popupRef.current?.remove();

//         // 生成弹窗内容 HTML (过滤掉不想显示的内部字段)
//         const ignoreKeys = ['_geometry', '_geometry_type'];
//         const rowsHtml = Object.entries(selectedFeature)
//             .filter(([key]) => !ignoreKeys.includes(key) && typeof key === 'string')
//             .map(([key, val]) => `
//                 <div class="flex justify-between py-1 border-b border-gray-700 last:border-0">
//                     <span class="text-gray-400 font-mono text-xs uppercase">${key}</span>
//                     <span class="text-cyan-400 font-bold text-xs ml-4 text-right">${val}</span>
//                 </div>
//             `).join('');

//         const popupContent = `
//             <div class="min-w-50">
//                 <div class="text-sm font-bold text-white mb-2 pb-1 border-b border-cyan-500 flex items-center">
//                     <span class="w-2 h-2 rounded-full bg-cyan-400 mr-2 shadow-[0_0_8px_#00e5ff]"></span>
//                     ${selectedFeature.name || 'Feature Details'}
//                 </div>
//                 <div>${rowsHtml}</div>
//             </div>
//         `;

//         // 创建自定义样式的弹窗
//         popupRef.current = new maplibregl.Popup({
//             closeButton: true,
//             closeOnClick: false,
//             className: 'dark-cool-popup', // 对应下面的 CSS 类名
//             maxWidth: '300px',
//             offset: 15
//         })
//         .setLngLat(centerCoord)
//         .setHTML(popupContent)
//         .addTo(map);

//         // 飞到该位置
//         map.flyTo({ center: centerCoord, zoom: 8, speed: 1.5 });
//     }

//   }, [selectedFeature, isMapLoaded]);

//   return (
//     <div className="w-full h-full relative">
//       {/* 地图容器 */}
//       <div ref={mapContainer} className="w-full h-full" />
      
//       {/* 🚨【新增】注入 CSS 样式：自定义黑色炫酷弹窗 */}
//       <style>{`
//         /* 弹窗容器背景 */
//         .dark-cool-popup .maplibregl-popup-content {
//             background: rgba(17, 24, 39, 0.95) !important; /* bg-gray-900 */
//             border: 1px solid #06b6d4; /* cyan-500 */
//             border-radius: 8px;
//             padding: 12px;
//             box-shadow: 0 0 15px rgba(6, 182, 212, 0.4); /* 发光阴影 */
//             backdrop-filter: blur(4px);
//         }
        
//         /* 弹窗小箭头 */
//         .dark-cool-popup .maplibregl-popup-tip {
//             border-top-color: #06b6d4 !important;
//             border-bottom-color: #06b6d4 !important;
//         }

//         /* 关闭按钮 */
//         .dark-cool-popup .maplibregl-popup-close-button {
//             color: #22d3ee;
//             font-size: 16px;
//             outline: none;
//             padding-right: 6px;
//             padding-top: 6px;
//         }
//         .dark-cool-popup .maplibregl-popup-close-button:hover {
//             color: white;
//             background: transparent;
//         }
//       `}</style>

//       {/* 悬浮的文件名提示 */}
//       {fileName && (
//         <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md text-cyan-400 px-3 py-1 rounded border border-cyan-500/30 text-xs font-mono z-10">
//           VISUALIZING: {fileName}
//         </div>
//       )}
//     </div>
//   );
// };

// export default MapView;

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bbox, center } from '@turf/turf';
import { Select, ConfigProvider, theme, Space, Typography } from 'antd'; // 引入 Ant Design

const { Option } = Select;
const { Text } = Typography;

interface MapViewProps {
    data: any;        // GeoJSON 数据
    fileName: string; // 当前文件名
    selectedFeature?: any;
    onFeatureClick?: (feature: any) => void;
}

// --- 配置常量 ---

// 1. 预设颜色方案 (Color Schemes)
const COLOR_SCHEMES = {
    default: { name: '默认青色', colors: ['#00e5ff', '#00e5ff'] },
    magma: { name: '岩浆 (Magma)', colors: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'] },
    viridis: { name: '翠绿 (Viridis)', colors: ['#440154', '#414487', '#2a788e', '#22a884', '#7ad151', '#fde725'] },
    plasma: { name: '等离子 (Plasma)', colors: ['#0d0887', '#6a00a8', '#b12a90', '#e16462', '#fca636', '#f0f921'] },
    blues: { name: '海洋蓝 (Blues)', colors: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'] },
    reds: { name: '火焰红 (Reds)', colors: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d'] },
};

// 2. 预设底图样式 (Basemaps)
const BASEMAPS = [
    {
        key: 'dark',
        name: '暗夜黑 (Dark)',
        style: {
            version: 8,
            sources: {
                'carto-dark': {
                    type: 'raster',
                    tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
                    tileSize: 256,
                    attribution: '&copy; CARTO'
                }
            },
            layers: [{ id: 'carto-dark-layer', type: 'raster', source: 'carto-dark' }]
        }
    },
    {
        key: 'light',
        name: '简洁白 (Light)',
        style: {
            version: 8,
            sources: {
                'carto-light': {
                    type: 'raster',
                    tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'],
                    tileSize: 256,
                    attribution: '&copy; CARTO'
                }
            },
            layers: [{ id: 'carto-light-layer', type: 'raster', source: 'carto-light' }]
        }
    },
    {
        key: 'satellite',
        name: '卫星图 (Satellite)',
        style: {
            version: 8,
            sources: {
                'google-sat': {
                    type: 'raster',
                    tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'], // Google Satellite
                    tileSize: 256,
                    attribution: '&copy; Google'
                }
            },
            layers: [{ id: 'google-sat-layer', type: 'raster', source: 'google-sat' }]
        }
    }
];

const MapView: React.FC<MapViewProps> = ({ data, fileName, selectedFeature, onFeatureClick }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<maplibregl.Map | null>(null);
    const popupRef = useRef<maplibregl.Popup | null>(null);
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    // --- 新增 State ---
    const [numericFields, setNumericFields] = useState<string[]>([]); // 可用于映射的数值字段
    const [activeField, setActiveField] = useState<string | null>(null); // 当前选中的映射字段
    const [activeScheme, setActiveScheme] = useState<string>('default'); // 当前颜色方案
    const [activeBasemap, setActiveBasemap] = useState<string>('dark'); // 当前底图

    // 1. 初始化地图
    useEffect(() => {
        if (mapInstance.current) return;

        if (mapContainer.current) {
            // 默认使用第一个底图配置
            const defaultStyle = BASEMAPS.find(b => b.key === 'dark')?.style || BASEMAPS[0].style;

            mapInstance.current = new maplibregl.Map({
                container: mapContainer.current,
                style: defaultStyle as any, // 类型强转，只要符合 Mapbox Style Spec 即可
                center: [118.7969, 32.0603],
                zoom: 7
            });

            mapInstance.current.on('load', () => {
                console.log('✅ 地图加载完成');
                setIsMapLoaded(true);
                mapInstance.current?.resize();
            });
        }

        return () => {
            setIsMapLoaded(false);
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    // 2. 数据处理：提取数值字段 (当 data 变化时)
    useEffect(() => {
        if (data && data.features && data.features.length > 0) {
            const firstProps = data.features[0].properties;
            const fields = Object.keys(firstProps).filter(key => {
                const val = firstProps[key];
                return typeof val === 'number'; // 只筛选数值类型的字段
            });
            setNumericFields(fields);
            // 切换数据时，重置选中字段，除非新数据也有同名字段
            setActiveField(prev => fields.includes(prev || '') ? prev : null);
        } else {
            setNumericFields([]);
        }
    }, [data]);

    // 3. 监听数据变化，渲染图层
    useEffect(() => {
        if (isMapLoaded && data) {
            // 渲染几何图形
            renderGeoJSON(data);
            // 渲染后立即应用一次颜色（如果已有选中的字段）
            updateChoroplethColors();
        }
    }, [data, isMapLoaded]);

    // 4. 监听可视化配置变化（字段、配色），只更新 Paint Property，不重绘 Geometry
    useEffect(() => {
        if (isMapLoaded && data) {
            updateChoroplethColors();
        }
    }, [activeField, activeScheme, isMapLoaded]);

    // 5. 监听底图切换
    const handleBasemapChange = (basemapKey: string) => {
        const map = mapInstance.current;
        if (!map) return;

        const targetStyle = BASEMAPS.find(b => b.key === basemapKey)?.style;
        if (targetStyle) {
            setActiveBasemap(basemapKey);
            // 🚨 关键：setStyle 会清除所有图层。必须在 style 加载后重新添加数据图层
            map.setStyle(targetStyle as any);
            
            map.once('styledata', () => {
                if (data) {
                    console.log('🗺️ 底图切换，重新渲染数据层...');
                    renderGeoJSON(data);
                    updateChoroplethColors(); // 重新应用颜色
                }
            });
        }
    };

    /**
     * 核心渲染逻辑：只负责 Geometry 和基础图层架构
     */
    const renderGeoJSON = (geoJSON: any) => {
        const map = mapInstance.current;
        if (!map) return;
        if (!map.style || !map.isStyleLoaded()) return; // 简化的卫兵

        const sourceId = 'uploaded-geo-data';

        // 清理旧图层
        const layersToRemove = ['geo-fill-layer', 'geo-line-layer', 'geo-highlight-fill', 'geo-highlight-line'];
        layersToRemove.forEach(layer => {
            if (map.getLayer(layer)) map.removeLayer(layer);
        });
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        // 添加数据源
        map.addSource(sourceId, { type: 'geojson', data: geoJSON });

        // 1. 填充层 (基础样式，颜色会被 updateChoroplethColors 覆盖)
        map.addLayer({
            id: 'geo-fill-layer',
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': '#00e5ff', // 默认颜色
                'fill-opacity': 0.6      // 稍微提高不透明度以便看清色斑
            }
        });

        // 2. 边框层
        map.addLayer({
            id: 'geo-line-layer',
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': activeBasemap === 'light' ? '#666' : '#a5f3fc', // 根据底图调整边框色
                'line-width': 1,
                'line-opacity': 0.5
            }
        });

        // 3. 高亮层 (保持原样)
        map.addLayer({
            id: 'geo-highlight-fill',
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': '#ffffff',
                'fill-opacity': 0.2
            },
            filter: ['==', 'id', 'nothing-selected']
        });
        map.addLayer({
            id: 'geo-highlight-line',
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': '#ffffff',
                'line-width': 3
            },
            filter: ['==', 'id', 'nothing-selected']
        });

        // Fit Bounds (如果是刚加载数据，才飞；如果是切底图，不飞)
        // 这里简单处理：每次 render 都飞一下，或者你可以加个 flag 控制
        try {
            const bounds = bbox(geoJSON) as [number, number, number, number];
            map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 1500 });
        } catch(e) { console.warn('BBox calc failed', e) }

        // 绑定事件 (同原代码，略微精简)
        if (map.getLayer('geo-fill-layer')) {
            map.on('click', 'geo-fill-layer', (e) => {
                if (e.features && e.features.length > 0) {
                    const feature = e.features[0];
                    const props = feature.properties;
                    // 处理 cp 字符串
                    if (typeof props.cp === 'string') {
                        try { props.cp = JSON.parse(props.cp); } catch (err) {}
                    }
                    if (!props.cp || !Array.isArray(props.cp)) {
                         try {
                            const centerFeature = center(feature as any);
                            props.cp = centerFeature.geometry.coordinates;
                        } catch(err) { props.cp = [e.lngLat.lng, e.lngLat.lat]; }
                    }
                    if (onFeatureClick) onFeatureClick(props);
                }
            });
            map.on('mouseenter', 'geo-fill-layer', () => map.getCanvas().style.cursor = 'pointer');
            map.on('mouseleave', 'geo-fill-layer', () => map.getCanvas().style.cursor = '');
        }
    };

    /**
     * 🎨 核心：更新颜色映射 (Choropleth)
     */
    const updateChoroplethColors = () => {
        const map = mapInstance.current;
        if (!map || !map.getLayer('geo-fill-layer') || !data) return;

        // 1. 如果没有选字段，恢复默认颜色
        if (!activeField || activeField === 'none') {
            map.setPaintProperty('geo-fill-layer', 'fill-color', '#00e5ff');
            return;
        }

        // 2. 获取配色方案
        // @ts-ignore
        const scheme = COLOR_SCHEMES[activeScheme] || COLOR_SCHEMES.default;
        const colors = scheme.colors;

        // 3. 计算极值 (Min/Max)
        let min = Infinity;
        let max = -Infinity;
        data.features.forEach((f: any) => {
            const val = f.properties[activeField];
            if (typeof val === 'number') {
                if (val < min) min = val;
                if (val > max) max = val;
            }
        });

        if (min === Infinity || max === -Infinity) return; // 没数据

        // 4. 构建插值表达式 (Linear Interpolation)
        // format: ['interpolate', ['linear'], ['get', field], stop1, color1, stop2, color2, ...]
        const step = (max - min) / (colors.length - 1);
        const expression: any[] = ['interpolate', ['linear'], ['get', activeField]];
        
        colors.forEach((color: string, index: number) => {
            expression.push(min + step * index);
            expression.push(color);
        });

        // 5. 应用到地图
        map.setPaintProperty('geo-fill-layer', 'fill-color', expression);
        
        console.log(`🎨 颜色映射更新: Field=${activeField}, Range=[${min}, ${max}]`);
    };

    // 监听 selectedFeature 高亮 (保持原有逻辑)
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !isMapLoaded) return;
        if (!selectedFeature) {
            if (map.getLayer('geo-highlight-fill')) map.setFilter('geo-highlight-fill', ['==', 'id', 'nothing']);
            if (map.getLayer('geo-highlight-line')) map.setFilter('geo-highlight-line', ['==', 'id', 'nothing']);
            popupRef.current?.remove();
            return;
        }
        const uniqueKey = selectedFeature.id ? 'id' : 'name';
        const uniqueVal = selectedFeature.id || selectedFeature.name;
        if (uniqueVal) {
            if (map.getLayer('geo-highlight-fill')) map.setFilter('geo-highlight-fill', ['==', uniqueKey, uniqueVal]);
            if (map.getLayer('geo-highlight-line')) map.setFilter('geo-highlight-line', ['==', uniqueKey, uniqueVal]);
        }
        // Popup 逻辑保持原样...
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
            const ignoreKeys = ['_geometry', '_geometry_type'];
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

            {/* 🛠️ 控制面板 (右上角) */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-3">
                
                {/* 使用 Antd ConfigProvider 强制深色主题 */}
                <ConfigProvider
                    theme={{
                        algorithm: theme.darkAlgorithm,
                        token: {
                            colorBgContainer: 'rgba(17, 24, 39, 0.8)', // bg-gray-900 transparent
                            colorBorder: '#06b6d4', // cyan-500
                            colorPrimary: '#00e5ff',
                        }
                    }}
                >
                    {/* 面板容器 */}
                    <div className="bg-gray-900/90 backdrop-blur-md border border-cyan-500/30 p-4 rounded-lg shadow-[0_0_15px_rgba(0,0,0,0.5)] w-64">
                        
                        <div className="mb-4 border-b border-gray-700 pb-2">
                            <span className="text-cyan-400 font-bold text-sm flex items-center">
                                <span className="w-2 h-2 bg-cyan-400 rounded-full mr-2 shadow-[0_0_5px_#00e5ff]"></span>
                                图层可视化配置
                            </span>
                        </div>

                        {/* 🚨 修复点：Antd v6 使用 orientation 替代 direction */}
                        <Space orientation="vertical" className="w-full" size="middle">
                            
                            {/* 1. 字段选择 */}
                            <div>
                                <Text className="text-gray-400 text-xs mb-1 block">映射字段 (Color Field)</Text>
                                <Select
                                    className="w-full"
                                    placeholder="选择数值字段..."
                                    value={activeField}
                                    onChange={setActiveField}
                                    allowClear
                                    disabled={numericFields.length === 0}
                                >
                                    <Option value="none">-- 无 (纯色) --</Option>
                                    {numericFields.map(field => (
                                        <Option key={field} value={field}>{field}</Option>
                                    ))}
                                </Select>
                            </div>

                            {/* 2. 颜色方案 */}
                            {activeField && activeField !== 'none' && (
                                <div>
                                    <Text className="text-gray-400 text-xs mb-1 block">颜色方案 (Palette)</Text>
                                    <Select
                                        className="w-full"
                                        value={activeScheme}
                                        onChange={setActiveScheme}
                                    >
                                        {Object.entries(COLOR_SCHEMES).map(([key, scheme]) => (
                                            <Option key={key} value={key}>
                                                <div className="flex items-center justify-between">
                                                    <span>{scheme.name}</span>
                                                    {/* 小色条预览 */}
                                                    <div className="flex h-3 w-12 ml-2 rounded overflow-hidden border border-white/20">
                                                        {scheme.colors.map((c, index) => (
                                                            // 使用 index 作为 key，确保唯一性
                                                            <div key={index} style={{ backgroundColor: c, flex: 1 }} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </Option>
                                        ))}
                                    </Select>
                                </div>
                            )}

                            {/* 3. 底图切换 */}
                            <div>
                                <Text className="text-gray-400 text-xs mb-1 block">底图样式 (Basemap)</Text>
                                <Select
                                    className="w-full"
                                    value={activeBasemap}
                                    onChange={handleBasemapChange}
                                >
                                    {BASEMAPS.map(b => (
                                        <Option key={b.key} value={b.key}>{b.name}</Option>
                                    ))}
                                </Select>
                            </div>

                        </Space>
                    </div>
                </ConfigProvider>
            </div>

            {/* 文件名提示 (左上角，保留) */}
            {fileName && (
                <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md text-cyan-400 px-3 py-1 rounded border border-cyan-500/30 text-xs font-mono z-10 shadow-lg">
                    VISUALIZING: {fileName}
                </div>
            )}
            
            <style>{`
                /* 复用之前的 Popup 样式 */
                .dark-cool-popup .maplibregl-popup-content {
                    background: rgba(17, 24, 39, 0.95) !important;
                    border: 1px solid #06b6d4;
                    border-radius: 8px;
                    padding: 12px;
                    box-shadow: 0 0 15px rgba(6, 182, 212, 0.4);
                    backdrop-filter: blur(4px);
                }
                .dark-cool-popup .maplibregl-popup-tip {
                    border-top-color: #06b6d4 !important;
                    border-bottom-color: #06b6d4 !important;
                }
                .dark-cool-popup .maplibregl-popup-close-button {
                    color: #22d3ee;
                }
            `}</style>
        </div>
    );
};

export default MapView;