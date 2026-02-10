import React, { useMemo, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button, Segmented, Switch, Select } from 'antd';
import { 
    CloseOutlined, BarChartOutlined, RadarChartOutlined, 
    DotChartOutlined, PieChartOutlined, EnvironmentOutlined 
} from '@ant-design/icons';
// ✅ 引入类型定义
import { useAnalysisStore, type ChartType, type ColorThemeType } from '../../../stores/useAnalysisStore';
import * as echarts from 'echarts/core';

// ✅ [修改] 升级主题配置接口
// type: 'single' (单色+透明度变化) | 'gradient' (双色/多色插值)
interface ThemeConfig {
    label: string;
    type: 'single' | 'gradient'; 
    primary: string; // UI主色 (按钮/高亮)
    gradient: [string, string]; // 柱状图用的填充渐变
    stops?: [string, string]; // 地图用的插值断点 [LowColor, HighColor]
}

// ✅ [新增] 定义更丰富的色系
export const THEME_COLORS: Record<ColorThemeType, ThemeConfig> = {
    // === 原有单色系 (Opacity Mode) ===
    cyan:   { label: '赛博青', type: 'single', primary: '#22d3ee', gradient: ['#22d3ee', 'rgba(34, 211, 238, 0.1)'] },
    purple: { label: '迷幻紫', type: 'single', primary: '#e879f9', gradient: ['#e879f9', 'rgba(232, 121, 249, 0.1)'] },
    blue:   { label: '深海蓝', type: 'single', primary: '#3b82f6', gradient: ['#3b82f6', 'rgba(59, 130, 246, 0.1)'] },
    green:  { label: '极光绿', type: 'single', primary: '#34d399', gradient: ['#34d399', 'rgba(52, 211, 153, 0.1)'] },
    yellow: { label: '流光金', type: 'single', primary: '#facc15', gradient: ['#facc15', 'rgba(250, 204, 21, 0.1)'] },
    red:    { label: '赤焰红', type: 'single', primary: '#f87171', gradient: ['#f87171', 'rgba(248, 113, 113, 0.1)'] },

    // === ✅ [新增] 炫酷渐变色带 (Interpolation Mode) ===
    // 1. 冰火之歌 (蓝 -> 红) 对比度极高
    fire_ice: { 
        label: '冰火 (蓝-红)', 
        type: 'gradient', 
        primary: '#f87171', 
        gradient: ['#f87171', '#3b82f6'], // 柱状图上红下蓝
        stops: ['#3b82f6', '#f87171'] // 地图 Low=蓝, High=红
    },
    // 2. 岩浆 (黑紫 -> 亮黄) 经典的 Heatmap 配色
    magma: { 
        label: '岩浆 (紫-黄)', 
        type: 'gradient', 
        primary: '#facc15', 
        gradient: ['#facc15', '#6b21a8'], 
        stops: ['#6b21a8', '#facc15'] 
    },
    // 3. 翠绿 (深蓝 -> 亮绿) 护眼且清晰
    viridis: { 
        label: '森岭 (蓝-绿)', 
        type: 'gradient', 
        primary: '#34d399', 
        gradient: ['#34d399', '#1e3a8a'], 
        stops: ['#1e3a8a', '#34d399'] 
    },
    // 4. 深海 (浅蓝 -> 深蓝) 单色相但明度跨度大
    ocean: { 
        label: '深海 (浅-深)', 
        type: 'gradient', 
        primary: '#0ea5e9', 
        gradient: ['#0c4a6e', '#bae6fd'], 
        stops: ['#bae6fd', '#0c4a6e'] // Low=浅, High=深
    },
    // 5. 赛博朋克 (蓝 -> 粉) 霓虹感
    cyber: { 
        label: '霓虹 (蓝-粉)', 
        type: 'gradient', 
        primary: '#e879f9', 
        gradient: ['#e879f9', '#22d3ee'], 
        stops: ['#22d3ee', '#e879f9'] 
    }
};
// ✅ [新增] 高对比度对立色盘 (Low -> High)
export const CONTRAST_PALETTES = [
    ['#3b82f6', '#ef4444'], // 1. 经典冰火: 蓝 -> 红
    ['#10b981', '#8b5cf6'], // 2. 毒液: 绿 -> 紫
    ['#06b6d4', '#db2777'], // 3. 赛博: 青 -> 粉
    ['#f59e0b', '#2563eb'], // 4. 逆光: 橙 -> 深蓝 (对比极强)
    ['#84cc16', '#f43f5e'], // 5. 玫瑰: 酸橙 -> 玫红
    ['#6366f1', '#fbbf24'], // 6. 暮光: 靛蓝 -> 琥珀
];
// 为了兼容之前的代码，如果有地方用了 NEON_PALETTE，我们可以映射一下或者保留
// 这里我们为了彻底的效果，把 NEON_PALETTE 指向新的色盘的主色，或者直接导出
export const NEON_PALETTE = CONTRAST_PALETTES;

const ChartOverlay: React.FC = () => {
    const { 
        isChartVisible, setChartVisible, 
        pivotData, pivotConfig, generatedColumns, // 透视数据
        rawScatterData, scatterConfig, // 散点数据
        chartType, setChartType, // 全局图表类型
        // ✅ 引入联动状态
        isMapLinkageEnabled, setMapLinkageEnabled,
        highlightedCategory, // ✅ 必须解构出当前状态
        setHighlightedCategory,
        // ✅ 引入新状态
        mapColorTheme, setMapColorTheme,
        // ✅ [新增] 引入 activeColumn 相关 action
        setActiveColumn
    } = useAnalysisStore();

    // 散点图数据源切换：'Pivoted'(透视结果) vs 'Raw'(原始数据)
    const [scatterSource, setScatterSource] = useState<'Pivoted' | 'Raw'>('Pivoted');

    // 监听：如果有了新的 raw 数据且当前是散点图模式，自动切到 Raw 视图
    useEffect(() => {
        if (chartType === 'Scatter' && rawScatterData && rawScatterData.length > 0) {
            setScatterSource('Raw');
        }
    }, [chartType, rawScatterData]);

    // 1. 智能计算容器尺寸
    const { containerWidth, containerHeight } = useMemo(() => {
        if (!isChartVisible) return { containerWidth: 0, containerHeight: 0 };
        
        let w = 500;
        let h = 450; 
        const len = pivotData?.length || 0;
        
        if (chartType === 'Bar') {
            w = Math.min(600, Math.max(450, len * 70 + 100));
        } else if (chartType === 'Scatter') {
            w = 550; // 散点图一般方形或稍宽即可
            h = 500;
        } else if (chartType === 'Radar') {
            w = 500;
            h = 520;
        }
        return { containerWidth: w, containerHeight: h };
    }, [pivotData, chartType, isChartVisible]);

    // ================= 📊 柱状图配置 =================
const getBarOption = () => {
        if (!pivotData) return {};
        const is2D = generatedColumns.length > 1 || (generatedColumns[0] !== 'value');
        const xAxisData = pivotData.map(item => item.rowKey);
        const dataLength = pivotData.length;
        const showScroll = dataLength > 8;
        
        // ✅ [新增] 获取当前主题配置
        const theme = THEME_COLORS[mapColorTheme];

        let series: any[] = [];
        if (!is2D) {
            // ✅ [修改] 一维模式：使用 mapColorTheme
            series.push({
                name: pivotConfig.valueField || '统计值',
                type: 'bar',
                data: pivotData.map(item => item.value),
                itemStyle: {
                    // ✅ [修改] 使用主题色的渐变
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: theme.gradient[0] }, // 亮色
                        { offset: 1, color: theme.gradient[1] }  // 暗色/透明
                    ]),
                    borderRadius: [4, 4, 0, 0],
                    // ✅ [新增] 增加一点发光质感
                    shadowBlur: 5,
                    shadowColor: theme.gradient[1]
                },
                // ✅ [新增] 高亮样式：点击或 hover 时变亮
                emphasis: {
                     itemStyle: {
                        color: theme.primary,
                        shadowBlur: 15,
                        shadowColor: theme.primary
                     }
                },
                barMaxWidth: 50,
            });
        } else {
            // ✅ [修改] 二维模式：使用 CONTRAST_PALETTES 进行双色渐变渲染
            series = generatedColumns.map((colKey, index) => {
                // 获取对应的对立色对 [Low, High]
                const palette = CONTRAST_PALETTES[index % CONTRAST_PALETTES.length];
                const [lowColor, highColor] = palette;

                return {
                    name: colKey,
                    type: 'bar',
                    data: pivotData.map(row => row[colKey] || 0),
                    barMaxWidth: 30,
                    emphasis: { 
                        focus: 'series', blurScope: 'coordinateSystem', 
                        itemStyle: { 
                            shadowBlur: 15, 
                            shadowColor: highColor, // 高亮用暖色
                            borderColor: '#fff', 
                            borderWidth: 1 
                        }
                    },
                    itemStyle: {
                        // 纵向渐变：底部冷色 -> 顶部暖色
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: highColor }, // Top
                            { offset: 1, color: lowColor }   // Bottom
                        ]),
                        borderRadius: [2, 2, 0, 0],
                        // 给个边框让渐变更明显
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1
                    }
                };
            });
        }
        return {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(0,0,0,0.8)', textStyle: { color: '#fff' } },
            legend: { show: is2D, data: is2D ? generatedColumns : [], textStyle: { color: '#e5e7eb' }, bottom: showScroll ? 35 : 5, type: 'scroll' },
            grid: { top: '15%', left: '8%', right: '8%', bottom: showScroll ? '20%' : '12%', containLabel: true },
            dataZoom: showScroll ? [{ type: 'slider', show: true, bottom: 5, height: 12, borderColor: 'transparent', fillerColor: 'rgba(34, 211, 238, 0.3)', backgroundColor: 'rgba(255,255,255,0.05)', showDataShadow: false }] : [],
            xAxis: { type: 'category', data: xAxisData, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#e5e7eb', rotate: showScroll ? 0 : 30 } },
            yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)', type: 'dashed' } }, axisLabel: { color: '#9ca3af' } },
            series: series
        };
    };

    // ================= 🕸️ 雷达图配置 (无警告版) =================
const getRadarOption = () => {
        if (!pivotData) return {};
        const is2D = generatedColumns.length > 1 || (generatedColumns[0] !== 'value');
        let indicators: { name: string, max?: number }[] = [];
        let seriesData: any[] = [];
        
        // ✅ [新增] 获取当前主题色
        const theme = THEME_COLORS[mapColorTheme];

        if (is2D) {
            indicators = generatedColumns.map(col => ({ name: col }));
            seriesData = pivotData!.slice(0, 10).map((row) => ({
                value: generatedColumns.map(col => row[col] || 0),
                name: row.rowKey
            }));
        } else {
            const values = pivotData!.map(item => Number(item.value || 0));
            const maxVal = Math.max(...values);
            const safeMax = maxVal > 0 ? Math.ceil(maxVal * 1.1) : 10;
            const displayData = pivotData!.slice(0, 12); 
            indicators = displayData.map(item => ({
                name: String(item.rowKey).substring(0, 8),
                max: safeMax
            }));
            seriesData = [{
                value: displayData.map(item => item.value),
                name: pivotConfig.valueField || '统计值'
            }];
        }

        return {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item', backgroundColor: 'rgba(0,0,0,0.8)', borderColor: 'rgba(255,255,255,0.2)', textStyle: { color: '#fff' } },
            legend: {
                show: true, type: 'scroll', bottom: 5, textStyle: { color: '#e5e7eb' },
                pageIconColor: theme.primary, // ✅ 使用主题色
                pageTextStyle: { color: '#9ca3af' }
            },
            radar: {
                indicator: indicators,
                shape: 'polygon',
                axisName: {
                    color: is2D ? '#22d3ee' : theme.primary, // ✅ 使用主题色
                    fontSize: 12, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowBlur: 2
                },
                axisLabel: { show: false }, axisTick: { show: false },
                splitLine: {
                    lineStyle: {
                        color: [
                            'rgba(255, 255, 255, 0.05)', 
                            'rgba(255, 255, 255, 0.1)'
                        ].reverse()
                    }
                },
                splitArea: { show: true, areaStyle: { color: ['rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.05)'] } },
                axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } }
            },
            series: [{
                name: 'Data Analysis',
                type: 'radar',
                data: seriesData.map((item, index) => {
                    // ✅ [修改] 一维模式使用主题色
                    const color = is2D ? NEON_PALETTE[index % NEON_PALETTE.length][0] : theme.primary;
                    return {
                        ...item,
                        itemStyle: { color: color },
                        areaStyle: { color: color, opacity: 0.2 },
                        lineStyle: { width: 2 }
                    };
                }),
                symbol: 'circle',
                symbolSize: 4
            }]
        };
    };

    // ================= 📉 散点图配置 =================
    const getScatterOption = () => {
        if (scatterSource === 'Raw') {
            if (!rawScatterData || !scatterConfig.xField || !scatterConfig.yField) return {};
            
            const xField = scatterConfig.xField;
            const yField = scatterConfig.yField;
            const data = rawScatterData.map(item => [item[xField], item[yField]]);

            return {
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'item',
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    borderColor: 'rgba(167, 139, 250, 0.3)',
                    textStyle: { color: '#fff' },
                    formatter: (params: any) => {
                        const val = params.value;
                        return `<div style="font-weight:bold;color:#a78bfa">● Raw Point</div><div>${xField}: ${val[0]}</div><div>${yField}: ${val[1]}</div>`;
                    }
                },
                grid: { top: '15%', left: '8%', right: '8%', bottom: '12%', containLabel: true },
                xAxis: { type: 'value', name: xField, nameTextStyle: { color: '#a78bfa' }, splitLine: { show: false }, axisLabel: { color: '#e5e7eb' } },
                yAxis: { type: 'value', name: yField, nameTextStyle: { color: '#a78bfa' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)', type: 'dashed' } }, axisLabel: { color: '#9ca3af' }, scale: true },
                series: [{
                    type: 'scatter', symbolSize: 6, large: true,
                    itemStyle: { color: '#a78bfa', shadowBlur: 5, shadowColor: 'rgba(167, 139, 250, 0.5)', opacity: 0.8 },
                    data: data
                }]
            };
        } else {
            if (!pivotData) return {};
            const is2D = generatedColumns.length > 1 || (generatedColumns[0] !== 'value');
            const xAxisData = pivotData.map(item => item.rowKey);
            
            let series: any[] = [];
            if (!is2D) {
                series.push({
                    name: pivotConfig.valueField || '统计值',
                    type: 'scatter',
                    data: pivotData.map(item => item.value),
                    symbolSize: 15,
                    itemStyle: { color: '#22d3ee', shadowBlur: 10, shadowColor: 'rgba(34, 211, 238, 0.5)' }
                });
            } else {
                series = generatedColumns.map((colKey, index) => {
                    const colorPair = NEON_PALETTE[index % NEON_PALETTE.length];
                    return {
                        name: colKey,
                        type: 'scatter',
                        data: pivotData.map(row => row[colKey] || null),
                        symbolSize: 15,
                        itemStyle: { color: colorPair[0], shadowBlur: 10, shadowColor: colorPair[1] }
                    };
                });
            }

            return {
                backgroundColor: 'transparent',
                tooltip: { trigger: 'item', backgroundColor: 'rgba(0,0,0,0.8)', textStyle: { color: '#fff' } },
                legend: { show: is2D, data: is2D ? generatedColumns : [], textStyle: { color: '#e5e7eb' }, bottom: 5 },
                grid: { top: '15%', left: '5%', right: '5%', bottom: '15%', containLabel: true },
                xAxis: { type: 'category', data: xAxisData, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#e5e7eb', rotate: 30 } },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)', type: 'dashed' } }, axisLabel: { color: '#9ca3af' } },
                series: series
            };
        }
    };

    const getOption = useMemo(() => {
        if ((!pivotData && !rawScatterData) || !isChartVisible) return {};
        switch (chartType) {
            case 'Radar': return getRadarOption(); 
            case 'Scatter': return getScatterOption(); 
            case 'Bar': default: return getBarOption();
        }
    }, [pivotData, rawScatterData, chartType, scatterSource, scatterConfig, generatedColumns, pivotConfig, isChartVisible, mapColorTheme]); 

// ✅ [新增] 点击事件处理
    const onChartClick = (params: any) => {
        if (!isMapLinkageEnabled) return;
        
        console.log('Chart Click:', params);

        // 1. 处理行联动 (Category / Row)
        // params.name 对应 rowKey (X轴)
        if (params.name) {
            const nextCategory = highlightedCategory === params.name ? null : params.name;
            setHighlightedCategory(nextCategory);
        }

        // 2. 处理列联动 (Series / Column)
        // params.seriesName 对应列名 (Legend)
        // 只有在二维模式下 (generatedColumns > 0) 才处理
        if (params.seriesName && generatedColumns.includes(params.seriesName)) {
            // 设置当前激活的列，地图颜色将随之改变
            setActiveColumn(params.seriesName);
        }
    };
    
    // ✅ 点击空白处取消高亮 (可选，取决于 zrender 事件，这里先只处理数据点击)
    const onChartEvents = {
        'click': onChartClick
    };

    if (!isChartVisible) return null;
    
    // ✅ [新增] 判断是否显示色系选择器：开启联动 && 一维透视
    const showThemeSelect = isMapLinkageEnabled && pivotData && !pivotConfig.groupByCol && pivotConfig.groupByRow;

    return (
        <div 
            className="absolute bottom-8 right-8 z-1000 flex flex-col overflow-hidden
                       rounded-3xl transition-all duration-300 ease-out
                       bg-[#0b1121]/30 backdrop-blur-xl
                       border border-white/10 ring-1 ring-white/5
                       shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]
                       group hover:bg-[#0b1121]/40 hover:border-cyan-500/30"
            style={{ width: containerWidth, height: containerHeight }}
        >
            {/* 1. Header */}
            <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-white/5 bg-linear-to-r from-white/5 to-transparent">
                {/* 左侧：主图表切换 */}
                <div className="mr-2">
                    <Segmented<ChartType>
                        options={[
                            { label: '柱状图', value: 'Bar', icon: <BarChartOutlined /> },
                            { label: '雷达图', value: 'Radar', icon: <RadarChartOutlined /> },
                            { label: '散点图', value: 'Scatter', icon: <DotChartOutlined /> }, 
                            { label: '饼图', value: 'Pie', icon: <PieChartOutlined />, disabled: true },
                        ]}
                        value={chartType}
                        onChange={setChartType}
                        className="custom-segmented-glass"
                    />

                    {/* ✅ 色系选择器 (UI 优化：显示渐变色条) */}
                    {showThemeSelect && (
                         <Select
                            size="small"
                            variant="borderless"
                            value={mapColorTheme}
                            onChange={setMapColorTheme}
                            popupMatchSelectWidth={false}
                            className="w-28 ml-2"
                            options={Object.entries(THEME_COLORS).map(([key, conf]) => ({
                                label: (
                                    <div className="flex items-center gap-2">
                                        {/* 显示色条预览 */}
                                        <div className="w-4 h-2 rounded-xs" style={{ 
                                            background: conf.type === 'gradient' 
                                                ? `linear-gradient(to right, ${conf.stops![0]}, ${conf.stops![1]})`
                                                : conf.primary 
                                        }}></div>
                                        <span className="text-gray-300 text-xs">{conf.label}</span>
                                    </div>
                                ),
                                value: key
                            }))}
                         />
                    )}

                </div>

                {/* ✅ 中间：散点图数据源切换 (仅在 Scatter 模式下显示) */}
                <div className="flex-1 flex justify-end mr-4">
                    {chartType === 'Scatter' && (
                        <Segmented<'Pivoted' | 'Raw'>
                            options={[
                                { label: '透视', value: 'Pivoted' },
                                { label: '原始', value: 'Raw' }
                            ]}
                            value={scatterSource}
                            onChange={setScatterSource}
                            className="custom-segmented-glass-sm"
                            size="small"
                        />
                    )}
                </div>
                
                <Button 
                    type="text" shape="circle" icon={<CloseOutlined className="text-gray-300 hover:text-white" />} 
                    onClick={() =>{
                        setChartVisible(false);
                        setHighlightedCategory(null); // ✅ 关闭图表时清除高亮
                    }} className="hover:bg-white/10"
                />
            </div>

            {/* 2. ECharts */}
            <div className="flex-1 w-full h-full p-2 relative">
                <ReactECharts 
                    option={getOption} 
                    style={{ height: '100%', width: '100%' }} 
                    theme="dark" 
                    autoResize 
                    notMerge
                    // ✅ 绑定事件
                    onEvents={onChartEvents} 
                />
            </div>

            {/* Footer */}
            <div className="h-10 shrink-0 flex items-center justify-between px-4 border-t border-white/5 bg-white/5 text-xs text-gray-300">
                <div className="flex items-center gap-2 font-medium">
                    {/* ✅ [修改] 联动状态指示灯 */}
                    <EnvironmentOutlined className={isMapLinkageEnabled ? 'text-cyan-400' : 'text-gray-400'} />
                    <span>地图颜色映射联动</span>
                </div>
                {/* ✅ [修改] 绑定 store 状态 */}
                <Switch 
                    size="small" 
                    checked={isMapLinkageEnabled} 
                    onChange={(checked) => {
                        setMapLinkageEnabled(checked);
                        if(!checked) setHighlightedCategory(null);
                    }} 
                    className="bg-gray-500/50" 
                />
            </div>

            <style>{`
                /* 主切换器样式 */
                .custom-segmented-glass.ant-segmented {
                    background-color: rgba(0,0,0,0.2); color: #9ca3af; padding: 4px;
                }
                .custom-segmented-glass .ant-segmented-item-selected {
                    background-color: rgba(34, 211, 238, 0.15) !important; 
                    color: #22d3ee !important;
                    border: 1px solid rgba(34, 211, 238, 0.3);
                    backdrop-filter: blur(4px);
                }
                .custom-segmented-glass .ant-segmented-item:hover:not(.ant-segmented-item-selected) {
                    color: #fff !important; background-color: rgba(255,255,255,0.1) !important;
                }
                
                /* ✅ 副切换器样式 (更小更精致，紫色系区分) */
                .custom-segmented-glass-sm.ant-segmented {
                    background-color: rgba(0,0,0,0.3); color: #a78bfa;
                }
                .custom-segmented-glass-sm .ant-segmented-item-selected {
                    background-color: rgba(167, 139, 250, 0.2) !important;
                    color: #fff !important;
                    border: 1px solid rgba(167, 139, 250, 0.4);
                }
                .ant-segmented-thumb { background-color: transparent !important; }
            `}</style>
        </div>
    );
};

export default ChartOverlay;