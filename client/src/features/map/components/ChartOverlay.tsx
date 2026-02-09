import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button, Segmented, Switch } from 'antd';
import { 
    CloseOutlined, 
    BarChartOutlined, 
    RadarChartOutlined, 
    DotChartOutlined, 
    PieChartOutlined,
    EnvironmentOutlined 
} from '@ant-design/icons';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
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

type ChartType = 'Bar' | 'Radar' | 'Scatter' | 'Pie';

// 整齐数值计算辅助函数
const calculateNiceMax = (val: number) => {
    if (!val || val === 0) return 10;
    const target = val * 1.1;
    const exponent = Math.floor(Math.log10(target));
    const magnitude = Math.pow(10, exponent);
    const normalized = target / magnitude;
    let niceFactor;
    if (normalized <= 1) niceFactor = 1;
    else if (normalized <= 1.5) niceFactor = 1.5;
    else if (normalized <= 2) niceFactor = 2;
    else if (normalized <= 2.5) niceFactor = 2.5;
    else if (normalized <= 5) niceFactor = 5;
    else niceFactor = 10;
    return parseFloat((niceFactor * magnitude).toPrecision(10));
};

const ChartOverlay: React.FC = () => {
    const { 
        isChartVisible, 
        setChartVisible, 
        pivotData, 
        pivotConfig, 
        generatedColumns 
    } = useAnalysisStore();

    const [chartType, setChartType] = useState<ChartType>('Bar');
    const [mapLinkage, setMapLinkage] = useState(false);

    // 1. 智能计算容器尺寸
    const { containerWidth, containerHeight } = useMemo(() => {
        if (!pivotData || pivotData.length === 0) {
            return { containerWidth: 0, containerHeight: 0 };
        }
        
        let w = 500;
        let h = 450; 

        const len = pivotData.length;
        
        if (chartType === 'Bar') {
            w = Math.min(600, Math.max(450, len * 70 + 100));
        } else if (chartType === 'Radar') {
            w = 500;
            h = 520; 
        } else if (chartType === 'Scatter') {
            w = Math.min(600, Math.max(450, len * 50 + 100)); // 散点图可以稍微紧凑一点
        }

        return { containerWidth: w, containerHeight: h };
    }, [pivotData, chartType]);

    // ================= 📊 柱状图配置 =================
    const getBarOption = () => {
        const is2D = generatedColumns.length > 1 || (generatedColumns[0] !== 'value');
        const xAxisData = pivotData!.map(item => item.rowKey);
        const dataLength = pivotData!.length;
        const showScroll = dataLength > 8;
        
        let series: any[] = [];

        if (!is2D) {
            series.push({
                name: pivotConfig.valueField || '统计值',
                type: 'bar',
                data: pivotData!.map(item => item.value),
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
            series = generatedColumns.map((colKey, index) => {
                const colorPair = NEON_PALETTE[index % NEON_PALETTE.length];
                return {
                    name: colKey,
                    type: 'bar',
                    data: pivotData!.map(row => row[colKey] || 0),
                    barMaxWidth: 30,
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: colorPair[0] },
                            { offset: 1, color: colorPair[1] }
                        ]),
                        borderRadius: [2, 2, 0, 0],
                    }
                };
            });
        }

        return {
            backgroundColor: 'transparent',
            tooltip: { 
                trigger: 'axis', 
                axisPointer: { type: 'shadow' }, 
                confine: true,
                backgroundColor: 'rgba(0,0,0,0.8)',
                borderColor: 'rgba(255,255,255,0.2)',
                textStyle: { color: '#fff' }
            },
            legend: { 
                show: is2D, 
                data: is2D ? generatedColumns : [], 
                textStyle: { color: '#e5e7eb' },
                bottom: showScroll ? 35 : 5,
                type: 'scroll',
                pageIconColor: '#22d3ee',
                pageTextStyle: { color: '#9ca3af' }
            },
            grid: { 
                top: '15%', left: '5%', right: '5%', 
                bottom: showScroll ? (is2D ? '20%' : '15%') : (is2D ? '12%' : '8%'), 
                containLabel: true 
            },
            dataZoom: showScroll ? [{ type: 'slider', show: true, bottom: 5, height: 12, borderColor: 'transparent', fillerColor: 'rgba(34, 211, 238, 0.3)', backgroundColor: 'rgba(255,255,255,0.05)', showDataShadow: false, handleStyle: { color: '#22d3ee' } }] : [],
            xAxis: { 
                type: 'category', 
                data: xAxisData, 
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: '#e5e7eb', interval: 0, rotate: showScroll ? 0 : 30, hideOverlap: true, fontSize: 11 }
            },
            yAxis: { 
                type: 'value', 
                axisLine: { show: false },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)', type: 'dashed' } },
                axisLabel: { color: '#9ca3af', fontSize: 11 }
            },
            series: series
        };
    };

    // ================= 🕸️ 雷达图配置 =================
    const getRadarOption = () => {
        const is2D = generatedColumns.length > 1 || (generatedColumns[0] !== 'value');
        let indicators: { name: string, max: number }[] = [];
        let seriesData: any[] = [];

        if (is2D) {
            indicators = generatedColumns.map(col => {
                const values = pivotData!.map(row => Number(row[col] || 0));
                const maxVal = Math.max(...values);
                return { name: col, max: calculateNiceMax(maxVal) };
            });
            seriesData = pivotData!.slice(0, 10).map((row) => ({
                value: generatedColumns.map(col => row[col] || 0),
                name: row.rowKey
            }));
        } else {
            const values = pivotData!.map(item => Number(item.value || 0));
            const maxVal = Math.max(...values);
            const niceMax = calculateNiceMax(maxVal);
            const displayData = pivotData!.slice(0, 12); 
            indicators = displayData.map(item => ({
                name: String(item.rowKey).substring(0, 8),
                max: niceMax
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
                axisName: {
                    color: '#22d3ee',
                    fontSize: 12,
                    fontWeight: 'bold',
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowBlur: 2
                },
                splitLine: {
                    lineStyle: {
                        color: [
                            'rgba(34, 211, 238, 0.1)', 
                            'rgba(34, 211, 238, 0.2)',
                            'rgba(34, 211, 238, 0.3)',
                            'rgba(34, 211, 238, 0.4)',
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

    // ================= 📉 散点图配置 (新增) =================
    const getScatterOption = () => {
        const is2D = generatedColumns.length > 1 || (generatedColumns[0] !== 'value');
        const xAxisData = pivotData!.map(item => item.rowKey);
        const dataLength = pivotData!.length;
        const showScroll = dataLength > 15; // 散点图容纳更多数据才滚动
        
        let series: any[] = [];

        if (!is2D) {
            // --- 场景 1: 单维散点 ---
            series.push({
                name: pivotConfig.valueField || '统计值',
                type: 'scatter',
                data: pivotData!.map(item => item.value),
                symbolSize: 12,
                itemStyle: {
                    color: '#22d3ee',
                    shadowBlur: 10,
                    shadowColor: 'rgba(34, 211, 238, 0.5)'
                }
            });
        } else {
            // --- 场景 2: 多维散点 (不同颜色) ---
            series = generatedColumns.map((colKey, index) => {
                const colorPair = NEON_PALETTE[index % NEON_PALETTE.length];
                return {
                    name: colKey,
                    type: 'scatter',
                    // 如果某行某列没有值，给 null，echarts 会自动处理
                    data: pivotData!.map(row => row[colKey] || null),
                    symbolSize: 12,
                    itemStyle: {
                        color: colorPair[0], // 实色核心
                        shadowBlur: 10,
                        shadowColor: colorPair[1] // 辉光
                    }
                };
            });
        }

        return {
            backgroundColor: 'transparent',
            tooltip: { 
                trigger: 'item', // 散点图用 item 触发更合适
                backgroundColor: 'rgba(0,0,0,0.8)',
                borderColor: 'rgba(255,255,255,0.2)',
                textStyle: { color: '#fff' },
                formatter: (params: any) => {
                    // 自定义 Tooltip 显示：系列名 + X轴名 + 数值
                    return `
                        <div style="font-weight:bold;color:${params.color}">● ${params.seriesName}</div>
                        <div>${params.name}: ${params.value}</div>
                    `;
                }
            },
            legend: { 
                show: is2D, 
                data: is2D ? generatedColumns : [], 
                textStyle: { color: '#e5e7eb' }, 
                bottom: showScroll ? 35 : 5,
                type: 'scroll',
                pageIconColor: '#22d3ee',
                pageTextStyle: { color: '#9ca3af' }
            },
            grid: { 
                top: '15%', left: '5%', right: '5%', 
                bottom: showScroll ? (is2D ? '20%' : '15%') : (is2D ? '12%' : '8%'), 
                containLabel: true 
            },
            dataZoom: showScroll ? [{ type: 'slider', show: true, bottom: 5, height: 12, borderColor: 'transparent', fillerColor: 'rgba(34, 211, 238, 0.3)', backgroundColor: 'rgba(255,255,255,0.05)', showDataShadow: false, handleStyle: { color: '#22d3ee' } }] : [],
            xAxis: { 
                type: 'category', 
                data: xAxisData, 
                axisLine: { show: false },
                axisTick: { show: false },
                // 开启 splitLine 辅助看散点分布
                splitLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
                axisLabel: { color: '#e5e7eb', interval: 0, rotate: showScroll ? 0 : 30, hideOverlap: true, fontSize: 11 }
            },
            yAxis: { 
                type: 'value', 
                axisLine: { show: false },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)', type: 'dashed' } },
                axisLabel: { color: '#9ca3af', fontSize: 11 },
                scale: true // 让 Y 轴不强制从 0 开始，如果数值都很大的话
            },
            series: series
        };
    };

    const getOption = useMemo(() => {
        if (!pivotData || pivotData.length === 0) return {};
        switch (chartType) {
            case 'Radar': return getRadarOption();
            case 'Scatter': return getScatterOption(); 
            case 'Bar': default: return getBarOption();
        }
    }, [pivotData, pivotConfig, generatedColumns, chartType, containerWidth]);

    
    if (!isChartVisible || !pivotData || pivotData.length === 0) return null;

    return (
        <div 
            className="absolute bottom-8 right-8 z-1000 flex flex-col overflow-hidden
                       rounded-3xl transition-all duration-300 ease-out
                       bg-[#0b1121]/30 backdrop-blur-xl
                       border border-white/10 ring-1 ring-white/5
                       shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]
                       group hover:bg-[#0b1121]/40 hover:border-cyan-500/30 hover:shadow-[0_8px_32px_0_rgba(34,211,238,0.15)]"
            style={{ width: containerWidth, height: containerHeight }}
        >
            {/* 1. Header & Tab */}
            <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-white/5 bg-linear-to-r from-white/5 to-transparent">
                <div className="flex-1 mr-4">
                    <Segmented<ChartType>
                        options={[
                            { label: '柱状图', value: 'Bar', icon: <BarChartOutlined /> },
                            { label: '雷达图', value: 'Radar', icon: <RadarChartOutlined /> },
                            { label: '散点图', value: 'Scatter', icon: <DotChartOutlined /> }, // ✅ 已启用
                            { label: '饼图', value: 'Pie', icon: <PieChartOutlined />, disabled: true },
                        ]}
                        value={chartType}
                        onChange={setChartType}
                        className="custom-segmented-glass w-full"
                        block
                    />
                </div>
                <Button 
                    type="text" 
                    shape="circle"
                    icon={<CloseOutlined className="text-gray-300 hover:text-white" />} 
                    onClick={() => setChartVisible(false)}
                    className="hover:bg-white/10"
                />
            </div>

            {/* 2. ECharts */}
            <div className="flex-1 w-full h-full p-2 relative">
                <ReactECharts 
                    option={getOption} 
                    style={{ height: '100%', width: '100%' }}
                    theme="dark"
                    autoResize={true}
                    notMerge={true} 
                />
            </div>

            {/* 3. Footer */}
            <div className="h-10 shrink-0 flex items-center justify-between px-4 border-t border-white/5 bg-white/5 text-xs text-gray-300">
                <div className="flex items-center gap-2 font-medium">
                    <EnvironmentOutlined className={mapLinkage ? 'text-cyan-400' : 'text-gray-400'} />
                    <span>地图颜色映射联动</span>
                </div>
                <Switch 
                    size="small" 
                    checked={mapLinkage} 
                    onChange={setMapLinkage}
                    className="bg-gray-500/50" 
                />
            </div>

            <style>{`
                .custom-segmented-glass.ant-segmented {
                    background-color: rgba(0,0,0,0.2); 
                    color: #9ca3af;
                    padding: 4px;
                }
                .custom-segmented-glass .ant-segmented-item-selected {
                    background-color: rgba(34, 211, 238, 0.15) !important; 
                    color: #22d3ee !important;
                    border: 1px solid rgba(34, 211, 238, 0.3);
                    backdrop-filter: blur(4px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .custom-segmented-glass .ant-segmented-item:hover:not(.ant-segmented-item-selected) {
                    color: #fff !important;
                    background-color: rgba(255,255,255,0.1) !important;
                }
                .ant-segmented-thumb {
                    background-color: transparent !important;
                }
            `}</style>
        </div>
    );
};

export default ChartOverlay;