import React, { useMemo, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button, Segmented, Switch } from 'antd';
import { 
    CloseOutlined, BarChartOutlined, RadarChartOutlined, 
    DotChartOutlined, PieChartOutlined, EnvironmentOutlined 
} from '@ant-design/icons';
// ✅ 引入类型定义
import { useAnalysisStore, type ChartType } from '../../../stores/useAnalysisStore';
import * as echarts from 'echarts/core';

// 霓虹色盘
const NEON_PALETTE = [
    ['#22d3ee', 'rgba(34, 211, 238, 0.1)'], // 青
    ['#e879f9', 'rgba(232, 121, 249, 0.1)'], // 紫
    ['#3b82f6', 'rgba(59, 130, 246, 0.1)'],  // 蓝
    ['#34d399', 'rgba(52, 211, 153, 0.1)'],  // 绿
    ['#facc15', 'rgba(250, 204, 21, 0.1)'],  // 黄
    ['#f87171', 'rgba(248, 113, 113, 0.1)'], // 红
];

const ChartOverlay: React.FC = () => {
    const { 
        isChartVisible, setChartVisible, 
        pivotData, pivotConfig, generatedColumns, // 透视数据
        rawScatterData, scatterConfig, // 散点数据
        chartType, setChartType // 全局图表类型
    } = useAnalysisStore();

    const [mapLinkage, setMapLinkage] = useState(false);
    
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
        
        let series: any[] = [];
        if (!is2D) {
            // 一维模式
            series.push({
                name: pivotConfig.valueField || '统计值',
                type: 'bar',
                data: pivotData.map(item => item.value),
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#22d3ee' },
                        { offset: 1, color: 'rgba(6, 182, 212, 0.05)' }
                    ]),
                    borderRadius: [4, 4, 0, 0],
                },
                barMaxWidth: 50,
            });
        } else {
            // 二维模式
            series = generatedColumns.map((colKey, index) => {
                const colorPair = NEON_PALETTE[index % NEON_PALETTE.length];
                return {
                    name: colKey,
                    type: 'bar',
                    data: pivotData.map(row => row[colKey] || 0),
                    barMaxWidth: 30,
                    
                    // ✅ 核心修复：找回高亮交互功能
                    emphasis: { 
                        focus: 'series', // 聚焦当前系列，淡化其他系列
                        blurScope: 'coordinateSystem', // 在整个坐标系内淡化
                        itemStyle: {
                            shadowBlur: 15,
                            shadowColor: colorPair[0], // 高亮时增加同色系发光
                            borderColor: '#fff', // 增加白色描边提升对比度
                            borderWidth: 1
                        }
                    },

                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: colorPair[0] }, { offset: 1, color: colorPair[1] }
                        ]),
                        borderRadius: [2, 2, 0, 0],
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

        if (is2D) {
            indicators = generatedColumns.map(col => ({ 
                name: col,
                // max: undefined // 自动
            }));
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
                show: true,
                type: 'scroll',
                bottom: 5,
                textStyle: { color: '#e5e7eb' },
                pageIconColor: '#22d3ee',
                pageTextStyle: { color: '#9ca3af' }
            },
            radar: {
                indicator: indicators,
                shape: 'polygon',
                // ✅ 保持：移除 splitNumber，隐藏标签，解决警告
                axisName: {
                    color: '#22d3ee',
                    fontSize: 12,
                    fontWeight: 'bold',
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowBlur: 2
                },
                axisLabel: { show: false },
                axisTick: { show: false },
                splitLine: {
                    lineStyle: {
                        color: [
                            'rgba(34, 211, 238, 0.1)', 
                            'rgba(34, 211, 238, 0.2)',
                            'rgba(34, 211, 238, 0.3)',
                            'rgba(34, 211, 238, 0.4)',
                            'rgba(34, 211, 238, 0.5)', 
                        ].reverse()
                    }
                },
                splitArea: {
                    show: true,
                    areaStyle: {
                        color: ['rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.05)']
                    }
                },
                axisLine: {
                    lineStyle: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },
            series: [{
                name: 'Data Analysis',
                type: 'radar',
                data: seriesData.map((item, index) => {
                    const color = is2D ? NEON_PALETTE[index % NEON_PALETTE.length][0] : '#22d3ee';
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
    }, [pivotData, rawScatterData, chartType, scatterSource, scatterConfig, generatedColumns, pivotConfig, isChartVisible]); 

    if (!isChartVisible) return null;

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
                    onClick={() => setChartVisible(false)} className="hover:bg-white/10"
                />
            </div>

            {/* 2. ECharts */}
            <div className="flex-1 w-full h-full p-2 relative">
                <ReactECharts option={getOption} style={{ height: '100%', width: '100%' }} theme="dark" autoResize notMerge />
            </div>

            {/* 3. Footer */}
            <div className="h-10 shrink-0 flex items-center justify-between px-4 border-t border-white/5 bg-white/5 text-xs text-gray-300">
                <div className="flex items-center gap-2 font-medium">
                    <EnvironmentOutlined className={mapLinkage ? 'text-cyan-400' : 'text-gray-400'} />
                    <span>地图颜色映射联动</span>
                </div>
                <Switch size="small" checked={mapLinkage} onChange={setMapLinkage} className="bg-gray-500/50" />
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