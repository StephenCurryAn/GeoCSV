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

    // 添加一个 ref
    const lastFileNameRef = useRef<string>('');
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
        // 🚨 改进：只有当文件名变化时，才重新调整视野
        if (fileName !== lastFileNameRef.current) {
            try {
                const bounds = bbox(geoJSON) as [number, number, number, number];
                map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 1500 });
                lastFileNameRef.current = fileName; // 更新记录
            } catch(e) { console.warn('BBox calc failed', e) }
        }

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
            // 🚨 改进：防止 ID 类型不匹配 (String vs Number)
            // 如果是 ID，我们让它同时匹配 字符串形式 和 数字形式
            if (uniqueKey === 'id') {
                map.setFilter('geo-highlight-fill', [
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

            // 显式提取 ID，确保它不被 ignoreKeys 过滤掉，或者单独显示
            const displayId = selectedFeature.id || 'N/A';

            // 生成弹窗内容 HTML (过滤掉不想显示的内部字段)
            const ignoreKeys = ['_geometry', '_geometry_type'];
            const rowsHtml = Object.entries(selectedFeature)
                // 🚨 过滤掉 id (因为我们在标题栏或置顶显示它)，过滤掉 geometry 相关
                .filter(([key]) => key !== 'id' && !ignoreKeys.includes(key) && typeof key === 'string')
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