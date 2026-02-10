import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bbox } from '@turf/turf';
import { Button, Tooltip, App, Checkbox, Spin, Select, ConfigProvider, theme, Space, Typography } from 'antd'; // 引入 Ant Design
import ChartOverlay, { THEME_COLORS, CONTRAST_PALETTES } from './ChartOverlay';
import { geoService } from '../../../services/geoService';
import { BarChartOutlined } from '@ant-design/icons';
import { useAnalysisStore } from '../../../stores/useAnalysisStore'

const { Option } = Select;
const { Text } = Typography;

interface MapViewProps {
    data: any;        // GeoJSON 数据
    fileName: string; // 当前文件名
    fileId?: string; // 当前选中的文件ID (必须要有这个才能去后台拉全量数据)
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
    // reds: { name: '火焰红 (Reds)', colors: ['#fff5f0', '#99000d'] },
};

// ✅ [新增] 颜色插值辅助函数 (Hex -> RGB -> Interpolate -> Hex)
// 简单的线性插值，用于在JS端计算颜色
function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function componentToHex(c: number) {
    const hex = Math.round(c).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
}

function rgbToHex(r: number, g: number, b: number) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function interpolateColor(color1: string, color2: string, factor: number) {
    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    const r = c1.r + (c2.r - c1.r) * factor;
    const g = c1.g + (c2.g - c1.g) * factor;
    const b = c1.b + (c2.b - c1.b) * factor;
    return rgbToHex(r, g, b);
}

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
        name: '卫星图 (天地图)',
        style: {
            version: 8,
            sources: {
                'tianditu-sat': {
                    type: 'raster',
                    tiles: [
                        'http://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=2f10b6f61571dbb1f5c8199c813fea4d'
                    ], 
                    tileSize: 256,
                    attribution: '&copy; 天地图'
                }
            },
            layers: [{ id: 'tianditu-sat-layer', type: 'raster', source: 'tianditu-sat' }]
        }
    }
];

const MapView: React.FC<MapViewProps> = ({ data, fileName, fileId, selectedFeature, onFeatureClick }) => {
    // ✅ 修改 2: 获取上下文感知的 message 实例
    // 注意：MapView 必须被包裹在 <App> 组件中（通常在 main.tsx 或 App.tsx 已经包了）
    const { message } = App.useApp();
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<maplibregl.Map | null>(null);
    const popupRef = useRef<maplibregl.Popup | null>(null);
    // 缓存上一次的文件名，防止重复 fitBounds
    const lastFileNameRef = useRef<string>('');

    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [numericFields, setNumericFields] = useState<string[]>([]); // 可用于映射的数值字段
    const [activeField, setActiveField] = useState<string | null>(null); // 当前选中的映射字段
    const [activeScheme, setActiveScheme] = useState<string>('default'); // 当前颜色方案
    const [activeBasemap, setActiveBasemap] = useState<string>('dark'); // 当前底图
    
    // ✅状态管理 - 全量数据相关
    const [showAll, setShowAll] = useState(false);
    const [allData, setAllData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // ✅关键 - 决定当前地图渲染哪一份数据
    // 如果勾选了 showAll 且有缓存数据，就用 allData，否则用父组件传来的分页 data
    const displayData = (showAll && allData) ? allData : data;

    // ✅使用 Ref 来始终追踪最新的 displayData
    // Ref 可以穿透闭包，确保在事件监听器（如切换底图）中拿到的是这一刻应该显示的数据（全量），而不是旧数据
    const displayDataRef = useRef(displayData);
    // ✅每次组件渲染时，都更新 ref 的值为最新的 displayData
    displayDataRef.current = displayData;

    // ✅ [新增] 获取 Store 状态
    const { isChartVisible, setChartVisible, generatedColumns,
        pivotData, pivotConfig, // 数据
        isMapLinkageEnabled, highlightedCategory, mapColorTheme,// 联动状态
        // ✅ [新增] 获取 activeColumn
        activeColumn 
    } = useAnalysisStore();

    // ✅切换文件时的自动清理逻辑
    useEffect(() => {
        // 只要 fileId 变了，或者 fileName 变了，说明切文件了
        // 立即重置勾选框，并清空内存中的 allData
        if (showAll || allData) {
            console.log('切换文件，自动释放旧文件的全量数据内存...');
            setShowAll(false);
            setAllData(null); // 立即释放内存
        }
    }, [fileId, fileName]); // 依赖项加上 fileName 双重保险

    // ✅处理复选框点击事件
    const handleShowAllChange = async (e: any) => {
        const isChecked = e.target.checked;
        
        if (isChecked) {
            // 勾选：去加载数据
            if (!fileId) {
                message.warning("无法获取文件ID，无法加载全量数据");
                return;
            }

            // 如果已经有缓存，直接切状态，不请求
            if (allData) {
                setShowAll(true);
                return;
            }

            setLoading(true);
            try {
                // 调用后端接口 (需要在 geoService 中实现 getAllFileData)
                const resdata = await geoService.getAllFileData(fileId);
                if (resdata) {
                    setAllData(resdata); // 存入缓存
                    setShowAll(true);     // 切换状态
                    message.success(`全量数据加载完成: 共 ${resdata.pagination.total} 个要素`);
                }
            } catch (error) {
                console.error(error);
                message.error('加载全量数据失败');
                setShowAll(false); 
            } finally {
                setLoading(false);
            }
        } else {
            // 🚫 取消勾选：立即释放内存！
            console.log('用户取消勾选，释放全量数据内存...');
            setShowAll(false);
            setAllData(null); // 设置为 null，垃圾回收会介入
        }
    };

    // 初始化地图
    useEffect(() => {
        if (mapInstance.current) return;

        // mapContainer.current的初始值是<div ref={mapContainer} className="w-full h-full" />给的
        // （初始值是这个div）
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
                // 确保地图撑满屏幕，防止显示bug
                mapInstance.current?.resize();
            });
        }
        // 清理函数
        // 当这个地图组件被销毁（例如用户切到别的页面，或者组件被隐藏）时，
        // 彻底清除地图占用的资源，防止内存泄漏
        return () => {
            setIsMapLoaded(false);
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    // ✅数据处理：提取数值字段 (当 data 变化时)，改为依赖 displayData
    useEffect(() => {
        if (displayData && displayData.features && displayData.features.length > 0) {
            const firstProps = displayData.features[0].properties;
            // Object.keys（）处理被解析过的 JavaScript 对象
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
    }, [displayData]);

/**
     * ✅ [修改] 核心渲染逻辑：只负责 Geometry 和基础图层架构
     * (移除了底部的 map.on 事件绑定，防止重复)
     */
    const renderGeoJSON = (geoJSON: any) => {
        const map = mapInstance.current;
        if (!map || !map.getStyle()) return;

        const sourceId = 'uploaded-geo-data';

        // 清理旧图层 (注意名字变了)
        const layersToRemove = [
            'geo-fill-layer', 
            'geo-polygon-border', // ✅ 新图层名
            'geo-linestring-main', // ✅ 新图层名
            'geo-line-layer', // 旧图层名(兼容清理)
            'geo-point-layer', 
            'geo-highlight-fill', 'geo-highlight-line', 'geo-highlight-point'
        ];
        layersToRemove.forEach(layer => {
            if (map.getLayer(layer)) map.removeLayer(layer);
        });
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        // 添加数据源
        map.addSource(sourceId, { type: 'geojson', data: geoJSON });

        // 1. 填充层
        map.addLayer({
            id: 'geo-fill-layer', type: 'fill', source: sourceId,
            paint: { 'fill-color': '#00e5ff', 'fill-opacity': 0.6 },
            filter: ['==', '$type', 'Polygon']
        });
        // 2. ✅ 面边框图层 (Polygon Border) - 只渲染 Polygon 的轮廓
        // 它的任务是：高亮时变白，不参与颜色映射
        map.addLayer({
            id: 'geo-polygon-border', type: 'line', source: sourceId,
            paint: { 
                'line-color': '#a5f3fc', 
                'line-width': 1, 
                'line-opacity': 0.5 
            },
            filter: ['==', '$type', 'Polygon']
        });

        // 3. ✅ 线实体图层 (LineString Main) - 只渲染 LineString
        // 它的任务是：像面一样展示炫酷的渐变色
        map.addLayer({
            id: 'geo-linestring-main', type: 'line', source: sourceId,
            paint: { 
                'line-color': '#00e5ff', 
                'line-width': 3, // 默认粗一点，更有质感
                'line-opacity': 0.8,
                'line-blur': 1   // 加一点模糊，做出霓虹灯管效果
            },
            filter: ['==', '$type', 'LineString']
        });

        // 3. 点图层
        map.addLayer({
            id: 'geo-point-layer', type: 'circle', source: sourceId,
            paint: { 'circle-radius': 6, 'circle-color': '#00e5ff', 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' },
            filter: ['==', '$type', 'Point']
        });
        // 高亮层 (略，保持原样)
        map.addLayer({ id: 'geo-highlight-fill', type: 'fill', source: sourceId, paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.2 }, filter: ['==', 'id', 'nothing-selected'] });
        map.addLayer({ id: 'geo-highlight-line', type: 'line', source: sourceId, paint: { 'line-color': '#ffffff', 'line-width': 3 }, filter: ['==', 'id', 'nothing-selected'] });
        map.addLayer({ id: 'geo-highlight-point', type: 'circle', source: sourceId, paint: { 'circle-radius': 8, 'circle-color': '#ffffff', 'circle-stroke-width': 2, 'circle-stroke-color': '#ff0000' }, filter: ['==', 'id', 'nothing-selected'] });

        if (fileName !== lastFileNameRef.current) {
            try {
                const bounds = bbox(geoJSON) as [number, number, number, number];
                map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 1500 });
                lastFileNameRef.current = fileName; 
            } catch(e) { console.warn('BBox calc failed', e) }
        }
    };

/**
     * ✅ [新增] 专门的 Effect 处理事件绑定 (只运行一次或当 isMapLoaded 变时)
     * 解决了重复绑定导致的性能问题
     */
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !isMapLoaded) return;

        // 监听列表更新
        const interactiveLayers = [
            'geo-fill-layer', 
            'geo-polygon-border', 
            'geo-linestring-main', // ✅
            'geo-point-layer'
        ];

        const handleClick = (e: any) => {
            if (e.features && e.features.length > 0) {
                const feature = e.features[0];
                const props = feature.properties;
                // ... (props.cp 处理逻辑保持不变)
                if (typeof props.cp === 'string') { try { props.cp = JSON.parse(props.cp); } catch (err) {} }
                if (!props.cp || !Array.isArray(props.cp)) {
                    if (feature.geometry.type === 'Point') {
                         // @ts-ignore
                        props.cp = feature.geometry.coordinates;
                    } else { props.cp = [e.lngLat.lng, e.lngLat.lat]; }
                }
                if (onFeatureClick) onFeatureClick(props);
            }
        };

        const handleMouseEnter = () => map.getCanvas().style.cursor = 'pointer';
        const handleMouseLeave = () => map.getCanvas().style.cursor = '';

        // 绑定
        interactiveLayers.forEach(layerId => {
            map.on('click', layerId, handleClick);
            map.on('mouseenter', layerId, handleMouseEnter);
            map.on('mouseleave', layerId, handleMouseLeave);
        });

        // 清理
        return () => {
            interactiveLayers.forEach(layerId => {
                map.off('click', layerId, handleClick);
                map.off('mouseenter', layerId, handleMouseEnter);
                map.off('mouseleave', layerId, handleMouseLeave);
            });
        };
    }, [isMapLoaded]); // 只依赖 isMapLoaded


    // ✅ [修改] 核心联动着色逻辑：增强高亮对比度
    const updateLinkageColors = () => {
        const map = mapInstance.current;
        // 卫兵：只要没有核心图层就退出
        if (!map || (!map.getLayer('geo-fill-layer') && !map.getLayer('geo-linestring-main'))) return;
        
        const isPivotMode = isMapLinkageEnabled && pivotData && pivotData.length > 0;
        const isScenario1 = isPivotMode && !pivotConfig.groupByCol && pivotConfig.groupByRow; 
        const isScenario2 = isPivotMode && pivotConfig.groupByCol && pivotConfig.groupByRow; 

        if (isScenario1 || isScenario2) {
            const rowField = pivotConfig.groupByRow!;
            let targetValues: number[] = [];
            
            let useGradient = false;
            let gradStart = '#000';
            let gradEnd = '#fff';
            let singleColor = '#00e5ff';
            
            const themeConfig = THEME_COLORS[mapColorTheme];

            if (isScenario1) {
                targetValues = pivotData!.map(d => Number(d.value));
                if (themeConfig.type === 'gradient' && themeConfig.stops) {
                    useGradient = true;
                    gradStart = themeConfig.stops[0];
                    gradEnd = themeConfig.stops[1];
                } else {
                    useGradient = false;
                    singleColor = themeConfig.primary;
                }
            } else if (isScenario2) {
                const targetCol = (activeColumn && generatedColumns.includes(activeColumn)) 
                    ? activeColumn 
                    : generatedColumns[0];
                const colIndex = generatedColumns.indexOf(targetCol);
                const safeIndex = colIndex >= 0 ? colIndex : 0;
                const palette = CONTRAST_PALETTES[safeIndex % CONTRAST_PALETTES.length];
                
                useGradient = true;
                gradStart = palette[0];
                gradEnd = palette[1];
                targetValues = pivotData!.map(d => Number(d[targetCol] || 0));
                
                console.log(`🔗 联动渲染: Col=${targetCol}, Mode=${useGradient ? 'Gradient' : 'Single'}`);
            }

            const minVal = Math.min(...targetValues);
            const maxVal = Math.max(...targetValues);
            const range = maxVal - minVal;

            // 1. 颜色 & 透明度 (适用于 Fill 和 LineMain)
            const colorMatch: any[] = ['match', ['get', rowField]];
            const opacityMatch: any[] = ['match', ['get', rowField]];
            
            // 2. 边框逻辑 (适用于 PolygonBorder)
            const borderStrokeWidthMatch: any[] = ['match', ['get', rowField]];
            const borderStrokeColorMatch: any[] = ['match', ['get', rowField]];

            // 3. ✅ 线宽逻辑 (适用于 LineMain)
            // 线数据需要通过宽度变化来增强高亮效果
            const mainLineWidthMatch: any[] = ['match', ['get', rowField]];

            // 3. ✅ [新增] 点描边属性 (Point Stroke)
            const pointStrokeWidthMatch: any[] = ['match', ['get', rowField]];
            const pointStrokeColorMatch: any[] = ['match', ['get', rowField]];
            const pointRadiusMatch: any[] = ['match', ['get', rowField]]; // 顺便把半径也放到 match 里

            pivotData!.forEach((item, index) => {
                const val = targetValues[index]; 
                let normalized = 0.5;
                if (range > 0) normalized = (val - minVal) / range;

                let calculatedColor: string;
                let calculatedOpacity: number;

                if (useGradient) {
                    calculatedColor = interpolateColor(gradStart, gradEnd, normalized);
                    calculatedOpacity = 0.8; 
                } else {
                    calculatedColor = singleColor;
                    calculatedOpacity = 0.2 + (normalized * 0.7); 
                }

                const isSelected = highlightedCategory === item.rowKey;
                const hasActiveSelection = !!highlightedCategory;

                let finalColor = calculatedColor;
                let finalOpacity = calculatedOpacity;
                
                // Polygon Border Params
                let finalBorderWidth = 1;
                let finalBorderColor = 'rgba(255,255,255,0.3)';
                
                // ✅ Line Main Params
                let finalLineWidth = 3; // 默认线宽

                // ✅ Point Params (默认值)
                let finalPointRadius = 6;
                let finalPointStrokeWidth = 1;
                let finalPointStrokeColor = '#ffffff';

                if (hasActiveSelection) {
                    if (isSelected) {
                        // 选中: 颜色最亮，完全不透明
                        finalColor = calculatedColor;
                        finalOpacity = 1.0;
                        
                        // Polygon: 白边框加粗
                        finalBorderWidth = 4;
                        finalBorderColor = '#ffffff';

                        // ✅ Line: 线条加粗
                        finalLineWidth = 6; 

                        // ✅ Point: 变大，白边框加粗
                        finalPointRadius = 10;
                        finalPointStrokeWidth = 3;
                        finalPointStrokeColor = '#ffffff';
                    } else {
                        // 未选中: 颜色不变(保留上下文)，但变暗
                        finalColor = calculatedColor;
                        finalOpacity = 0.3; 
                        
                        // Polygon: 边框隐去
                        finalBorderWidth = 1;
                        finalBorderColor = 'rgba(255,255,255,0.1)';

                        // ✅ Line: 线条变细
                        finalLineWidth = 2;

                        // ✅ Point: 变小，边框几乎隐形
                        finalPointRadius = 4; // 稍微变小一点，退居次要位置
                        finalPointStrokeWidth = 1;
                        finalPointStrokeColor = 'rgba(255,255,255,0.1)'; // 关键：把边框也变暗！
                    }
                }

                colorMatch.push(item.rowKey, finalColor);
                opacityMatch.push(item.rowKey, finalOpacity);
                
                borderStrokeWidthMatch.push(item.rowKey, finalBorderWidth);
                borderStrokeColorMatch.push(item.rowKey, finalBorderColor);
                
                mainLineWidthMatch.push(item.rowKey, finalLineWidth);

                // Push Point Params
                pointRadiusMatch.push(item.rowKey, finalPointRadius);
                pointStrokeWidthMatch.push(item.rowKey, finalPointStrokeWidth);
                pointStrokeColorMatch.push(item.rowKey, finalPointStrokeColor);
            });

            // Defaults
            colorMatch.push('#374151');
            opacityMatch.push(0.1);
            borderStrokeWidthMatch.push(1);
            borderStrokeColorMatch.push('rgba(255,255,255,0.1)');
            mainLineWidthMatch.push(1);
            
            // 点默认值
            pointRadiusMatch.push(4);               // 默认半径 (未选中时变小)
            pointStrokeWidthMatch.push(0);          // 默认描边宽度 (无描边)
            pointStrokeColorMatch.push('rgba(255,255,255,0)'); // 默认描边颜色 (透明)
            
            // ============ 应用属性 ============

            // 1. Polygon Fill (面填充)
            map.setPaintProperty('geo-fill-layer', 'fill-color', colorMatch);
            map.setPaintProperty('geo-fill-layer', 'fill-opacity', opacityMatch);

            // 2. Polygon Border (面边框) - 使用 Border 逻辑
            map.setPaintProperty('geo-polygon-border', 'line-width', borderStrokeWidthMatch);
            map.setPaintProperty('geo-polygon-border', 'line-color', borderStrokeColorMatch);

            // 3. ✅ LineString Main (线实体) - 使用 Fill 颜色逻辑 + LineWidth 逻辑
            // 这样线数据就拥有了和面一样的渐变色！
            map.setPaintProperty('geo-linestring-main', 'line-color', colorMatch);
            map.setPaintProperty('geo-linestring-main', 'line-opacity', opacityMatch);
            map.setPaintProperty('geo-linestring-main', 'line-width', mainLineWidthMatch);

            // ✅ 4. Point (点) - 应用所有属性
             if (map.getLayer('geo-point-layer')) {
                 map.setPaintProperty('geo-point-layer', 'circle-color', colorMatch);
                 map.setPaintProperty('geo-point-layer', 'circle-opacity', opacityMatch);
                 // 应用半径、描边宽、描边色
                 map.setPaintProperty('geo-point-layer', 'circle-radius', pointRadiusMatch);
                 map.setPaintProperty('geo-point-layer', 'circle-stroke-width', pointStrokeWidthMatch);
                 map.setPaintProperty('geo-point-layer', 'circle-stroke-color', pointStrokeColorMatch);
             }

        } else {
            // ✅ [修复] 回退逻辑 (当不满足联动条件时)
             // 必须操作新图层，不能再操作 geo-line-layer
             
             // 1. 先尝试执行普通分级渲染 (如果用户选了字段)
             updateChoroplethColors();
             
             // 2. 恢复默认状态
             // 面图层
             if (map.getLayer('geo-fill-layer')) {
                 map.setPaintProperty('geo-fill-layer', 'fill-opacity', 0.6);
             }
             
             // 面边框 (Polygon Border)
             if (map.getLayer('geo-polygon-border')) {
                 map.setPaintProperty('geo-polygon-border', 'line-width', 1);
                 map.setPaintProperty('geo-polygon-border', 'line-color', activeBasemap === 'light' ? '#666' : '#a5f3fc');
             }

             // 线实体 (LineString Main)
             if (map.getLayer('geo-linestring-main')) {
                 map.setPaintProperty('geo-linestring-main', 'line-width', 2);
                 map.setPaintProperty('geo-linestring-main', 'line-color', '#00e5ff');
                 map.setPaintProperty('geo-linestring-main', 'line-opacity', 0.8);
             }
            // ✅ 恢复点图层默认状态
             if (map.getLayer('geo-point-layer')) {
                 map.setPaintProperty('geo-point-layer', 'circle-color', '#00e5ff');
                 map.setPaintProperty('geo-point-layer', 'circle-opacity', 1);
                 map.setPaintProperty('geo-point-layer', 'circle-radius', 6);
                 // 恢复白色描边
                 map.setPaintProperty('geo-point-layer', 'circle-stroke-width', 1);
                 map.setPaintProperty('geo-point-layer', 'circle-stroke-color', '#ffffff');
             }
        }
    };

    /**
     * 更新颜色映射 (Choropleth)
     */
    const updateChoroplethColors = () => {
        // 卫兵：如果开启了联动模式且符合条件，直接退出
        const isScenario1 = isMapLinkageEnabled && pivotData && pivotData.length > 0 && !pivotConfig.groupByCol && pivotConfig.groupByRow;
        if (isScenario1) return;

        const map = mapInstance.current;
        const currentDisplayData = displayDataRef.current;
        // ✅这里也改为使用 displayData
        if (!map || !map.getLayer('geo-fill-layer') || !currentDisplayData) return;

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
        currentDisplayData.features.forEach((f: any) => {
            const val = f.properties[activeField];
            if (typeof val === 'number') {
                if (val < min) min = val;
                if (val > max) max = val;
            }
        });

        if (min === Infinity || max === -Infinity) return; // 没数据

        // 4. 构建插值表达式 (Linear Interpolation)
        const step = (max - min) / (colors.length - 1);
        
        // Mapbox 样式规范中标准的表达式语法。它是一个数组，会被直接传给 GPU
        // 'interpolate'指令。告诉地图引擎：“我要做一个渐变效果，不是突变的
        // ['linear']线性插值
        // ['get', activeField]，这是输入变量，读取当前这个多边形（Feature）里名为 activeField（比如 'GDP'）的属性值
        const expression: any[] = ['interpolate', ['linear'], ['get', activeField]];
        
        // 注意，因为这里设置了['linear']线性插值，所以如果是计算数值区间之间的值，会显示混合渐变色
        colors.forEach((color: string, index: number) => {
            expression.push(min + step * index);
            expression.push(color);
        });

        // 5. 应用到地图
        // ✅ [修复] 应用颜色到新图层
        // 面数据：填充色变，边框保持默认
        if (map.getLayer('geo-fill-layer')) {
            map.setPaintProperty('geo-fill-layer', 'fill-color', expression);
        }
        
        // 线数据：线条本身变色
        if (map.getLayer('geo-linestring-main')) {
            map.setPaintProperty('geo-linestring-main', 'line-color', expression);
        }
        
        // 点数据
        if (map.getLayer('geo-point-layer')) {
            map.setPaintProperty('geo-point-layer', 'circle-color', expression);
        }
        
        console.log(`🎨 颜色映射更新: Field=${activeField}, Range=[${min}, ${max}]`);
    };

// ✅ [修改] Effect 1: 仅处理“数据几何渲染” (Geometry)
    // 只有当文件数据变化时，重绘
    useEffect(() => {
        if (isMapLoaded && displayData) {
            renderGeoJSON(displayData);
            updateLinkageColors(); // 初始绘制后立即上色
        }
    }, [displayData, isMapLoaded]); 


    // ✅ [修改] Effect 2: 仅处理“样式/颜色更新” (Paint)
    // 当联动开关、高亮状态、透视数据、或主题色变化时，只更新颜色
    useEffect(() => {
        if (isMapLoaded && displayData) {
            updateLinkageColors();
        }
    }, [
        isMapLinkageEnabled, pivotData, pivotConfig, 
        highlightedCategory, mapColorTheme, // ✅ 依赖新状态
        activeField, activeScheme
    ]);
    
    // 监听可视化配置变化（字段、配色），只更新 Paint Property，不重绘 Geometry
    useEffect(() => {
        if (isMapLoaded && data) {
            updateChoroplethColors();
        }
    }, [activeField, activeScheme, isMapLoaded]);
    
    // 用来记录上一次的底图，初始化为当前的 activeBasemap
    const prevBasemapRef = useRef(activeBasemap);
    // 监听样式数据加载，确保图层在切换底图后不丢失
    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        const onStyleData = () => {
            if (activeBasemap !== prevBasemapRef.current) {
                console.log(`底图改变触发: ${prevBasemapRef.current} -> ${activeBasemap}`);
                // 立即更新 Ref，防止后续的 styledata 事件重复打印
                prevBasemapRef.current = activeBasemap;
            }
            // ✅这里全部改成使用 displayDataRef.current
            const currentData = displayDataRef.current;
            // 只有当地图样式完全加载，且我们需要的数据存在时才执行
            if (map.getStyle() && currentData) {
                // console.log('地图样式完全加载，重新渲染');
                
                // 核心判断：如果数据源不见了（说明刚切换了底图），则重新渲染
                if (!map.getSource('uploaded-geo-data')) {
                    console.log('检测到底图切换，正在恢复 GeoJSON 图层...');
                    
                    // 加上 try-catch 防止极少数情况下的竞态错误
                    try {
                        renderGeoJSON(currentData);
                        // 稍微延迟一点点应用颜色，确保图层已经注册到 map 中
                        setTimeout(() => {
                            updateChoroplethColors();
                        }, 10);
                    } catch (err) {
                        console.warn('恢复图层失败，等待下一次事件:', err);
                    }
                }
            }
        };

        map.on('styledata', onStyleData);

        return () => {
            map.off('styledata', onStyleData);
        };
    // 这里加入 activeBasemap 依赖，是为了确保 renderGeoJSON 内部取到的边框颜色是基于新底图的
    }, [activeBasemap, activeField, activeScheme]);

    // handleBasemapChange只需要负责两件事：更新 React 状态、告诉地图切换样式
    // basemapKey 是从 UI 界面上的下拉菜单（Select 组件）传过来的
    const handleBasemapChange = (basemapKey: string) => {
        const map = mapInstance.current;
        if (!map) return;

        const targetStyle = BASEMAPS.find(b => b.key === basemapKey)?.style;
        if (targetStyle) {
            // 更新 React 状态 (用于 UI 显示)
            setActiveBasemap(basemapKey);
            
            // 切换地图样式 (这会触发 styledata 事件，进而触发上面的 useEffect)
            map.setStyle(targetStyle as any);
        }
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
            // 防止 ID 类型不匹配 (String vs Number)
            // 如果是 ID，我们让它同时匹配 字符串形式 和 数字形式
            if (uniqueKey === 'id') {
                map.setFilter('geo-highlight-fill', [
                    // 'any' 相当于 JavaScript 中的 ||（逻辑或）
                    'any', 
                    ['==', ['to-string', ['get', 'id']], String(uniqueVal)], // 把地图里的ID转字符串对比
                    ['==', ['get', 'id'], uniqueVal] // 或者直接对比
                ]);
                map.setFilter('geo-highlight-line', [
                    'any', 
                    ['==', ['to-string', ['get', 'id']], String(uniqueVal)],
                    ['==', ['get', 'id'], uniqueVal]
                ]);
            } else {
                // 只有 name 的情况 (旧逻辑)
                map.setFilter('geo-highlight-fill', ['==', uniqueKey, uniqueVal]);
                map.setFilter('geo-highlight-line', ['==', uniqueKey, uniqueVal]);
            }
        }
        // Popup 逻辑
        // 这里的 cp 现在肯定是数组了，因为我们在 click 事件里修复了它
        let centerCoord: [number, number] | null = null;
        // 使用数据自带的 cp (center point) 字段
        if (selectedFeature.cp && Array.isArray(selectedFeature.cp)) {
            centerCoord = selectedFeature.cp as [number, number];
        }

        if (centerCoord) {
            // 移除旧弹窗
            popupRef.current?.remove();

            // 显式提取 ID，确保它不被 ignoreKeys 过滤掉，或者单独显示
            const displayId = selectedFeature.id || 'N/A';

            // 生成弹窗内容 HTML (过滤掉不想显示的内部字段)
            // const ignoreKeys = ['_geometry', '_geometry_type'];
            const rowsHtml = Object.entries(selectedFeature)
                // 过滤掉 id (因为我们在标题栏或置顶显示它)，过滤掉 geometry 相关
                .filter(([key]) => {
                    // 1. 不显示 id (因为标题栏有了)
                    if (key === 'id') return false;
                    // 2. ✅不显示任何以 _ 开头的临时字段
                    if (key.startsWith('_')) return false;
                    // 3. 不显示 cp (中心点坐标)
                    if (key === 'cp') return false;
                    
                    return typeof key === 'string';
                })
                .map(([key, val]) => `
                    <div class="flex justify-between py-1 border-b border-gray-700 last:border-0">
                        <span class="text-gray-400 font-mono text-xs uppercase">${key}</span>
                        <span class="text-cyan-400 font-bold text-xs ml-4 text-right">${val}</span>
                    </div>
                `).join('');

            const popupContent = `
                <div class="min-w-50">
                    <div class="text-sm font-bold text-white mb-1 flex items-center justify-between">
                        <div class="flex items-center">
                            <span class="w-2 h-2 rounded-full bg-cyan-400 mr-2 shadow-[0_0_8px_#00e5ff]"></span>
                            ${selectedFeature.name || 'Feature'}
                        </div>
                        <span class="text-xs font-mono text-gray-500">ID: ${displayId}</span>
                    </div>
                    <div class="w-full h-px bg-cyan-500/50 mb-2"></div>
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
            map.flyTo({ center: centerCoord, zoom: 16, speed: 1.5 });
        }
    }, [selectedFeature, isMapLoaded]);


    return (
        <div className="w-full h-full relative">
            {/* ✅加载遮罩层 - 当请求全量数据时显示 */}
            {loading && (
                <div className="absolute inset-0 bg-black/60 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                    <Spin size="large" />
                    <span className="text-cyan-400 mt-3 font-mono">正在加载全量数据...</span>
                </div>
            )}

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
                        
                        <div className="mb-4 border-b border-gray-700 pb-2 flex items-center justify-between">
                            {/* 左侧：标题 */}
                            <span className="text-cyan-400 font-bold text-sm flex items-center">
                                <span className="w-2 h-2 bg-cyan-400 rounded-full mr-2 shadow-[0_0_5px_#00e5ff]"></span>
                                图层配置
                            </span>

                            {/* 右侧：开关 */}
                            <Checkbox 
                                checked={showAll}
                                onChange={handleShowAllChange}
                                disabled={!fileId || loading} 
                                className="text-gray-300 text-xs"
                            >
                                <span className="text-gray-300">
                                    数据显示({showAll ? '全量' : '分页'})
                                </span>
                            </Checkbox>
                        </div>

                        {/* Antd v6 使用 orientation 替代 direction */}
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
                                        {/* Object.entries 把它转换成数组，方便遍历 */}
                                        {Object.entries(COLOR_SCHEMES).map(([key, scheme]) => (
                                            <Option key={key} value={key}>
                                                <div className="flex items-center justify-between">
                                                    <span>{scheme.name}</span>
                                                    {/* 小色条预览 */}
                                                    <div className="flex h-3 w-12 ml-2 rounded overflow-hidden border border-white/20">
                                                        {scheme.colors.map((c, index) => (
                                                            // 使用 index 作为 key，确保唯一性
                                                            // flex: 1：这一句最关键。 它的意思是“平分空间
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
            
            {/* ✅ 3. 放置 HUD 图表组件 (绝对定位在地图层之上) */}
            <ChartOverlay />

            {/* ✅ 4. (可选) 增加一个悬浮按钮，用于在关闭图表后重新打开 */}
            {!isChartVisible && pivotData && pivotData.length > 0 && (
                <div className="absolute top-4 right-4 z-900">
                    <Tooltip title="显示透视分析图表" placement="left">
                        <Button 
                            type="primary" 
                            shape="circle" 
                            size="large"
                            icon={<BarChartOutlined />} 
                            onClick={() => setChartVisible(true)}
                            className="bg-cyan-600 border-cyan-500 shadow-lg shadow-cyan-900/50"
                        />
                    </Tooltip>
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