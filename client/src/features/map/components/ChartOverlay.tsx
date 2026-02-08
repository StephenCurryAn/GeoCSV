import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button } from 'antd';
import { CloseOutlined, BarChartOutlined } from '@ant-design/icons';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import * as echarts from 'echarts/core';

// 霓虹色盘保持不变
const NEON_PALETTE = [
    ['#22d3ee', 'rgba(34, 211, 238, 0.1)'], 
    ['#e879f9', 'rgba(232, 121, 249, 0.1)'], 
    ['#3b82f6', 'rgba(59, 130, 246, 0.1)'],  
    ['#34d399', 'rgba(52, 211, 153, 0.1)'],  
    ['#facc15', 'rgba(250, 204, 21, 0.1)'],  
];

const ChartOverlay: React.FC = () => {
    const { 
        isChartVisible, 
        setChartVisible, 
        pivotData, 
        pivotConfig, 
        generatedColumns 
    } = useAnalysisStore();

    // 1. 智能计算容器尺寸 (优化版：限制最大宽度)
    const { containerWidth, containerHeight } = useMemo(() => {
        if (!pivotData || pivotData.length === 0) {
            return { containerWidth: 0, containerHeight: 0 };
        }
        const len = pivotData.length;
        
        // ✅ 核心修改：宽度计算逻辑
        // 最小 420px，每增加一条数据预留空间，但最大死锁在 600px
        // 这样既保证了数据少时不空旷，数据多时也不遮挡地图
        const calculatedWidth = Math.min(600, Math.max(420, len * 70 + 100));
        
        // 高度保持不变
        const is2D = generatedColumns.length > 1;
        const calculatedHeight = is2D ? 420 : 340;
        
        return { containerWidth: calculatedWidth, containerHeight: calculatedHeight };
    }, [pivotData, generatedColumns]);

    // 2. ECharts 配置
    const getOption = useMemo(() => {
        if (!pivotData || pivotData.length === 0) return {};

        const dataLength = pivotData.length;
        // ✅ 判断是否需要开启滚动条 (超过 8 条数据)
        const showScroll = dataLength > 8;

        const is2D = generatedColumns.length > 1 || (generatedColumns[0] !== 'value');
        const xAxisData = pivotData.map(item => item.rowKey);
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
                        { offset: 0.5, color: '#06b6d4' },
                        { offset: 1, color: 'rgba(6, 182, 212, 0.05)' }
                    ]),
                    borderRadius: [6, 6, 0, 0],
                    borderColor: 'rgba(34, 211, 238, 0.3)',
                    borderWidth: 1
                },
                emphasis: {
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#67e8f9' },
                            { offset: 1, color: 'rgba(6, 182, 212, 0.2)' }
                        ]),
                        borderColor: '#67e8f9',
                        borderWidth: 2,
                        shadowBlur: 15,
                        shadowColor: 'rgba(34, 211, 238, 0.5)'
                    }
                },
                barMaxWidth: 50,
                barMinWidth: 24
            });
        } else {
            // 二维模式
            series = generatedColumns.map((colKey, index) => {
                const colorPair = NEON_PALETTE[index % NEON_PALETTE.length];
                return {
                    name: colKey,
                    type: 'bar',
                    data: pivotData.map(row => row[colKey] || 0),
                    emphasis: { focus: 'series' },
                    barMaxWidth: 30,
                    barGap: '10%', 
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: colorPair[0] }, 
                            { offset: 1, color: colorPair[1] } 
                        ]),
                        borderRadius: [4, 4, 0, 0],
                        borderColor: colorPair[0],
                        borderWidth: 0.5,
                        opacity: 0.85
                    }
                };
            });
        }

        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { 
                    type: 'shadow',
                    shadowStyle: { color: 'rgba(255,255,255,0.05)' } 
                },
                backgroundColor: 'rgba(0,0,0,0.8)',
                borderColor: 'rgba(34, 211, 238, 0.5)',
                borderWidth: 1,
                textStyle: { color: '#e5e7eb' },
                confine: true,
                padding: [8, 12],
                extraCssText: 'box-shadow: 0 0 15px rgba(34, 211, 238, 0.2); backdrop-filter: blur(4px);'
            },
            legend: {
                show: is2D,
                data: is2D ? generatedColumns : [],
                textStyle: { color: '#9ca3af' },
                // 如果有滚动条，图例往上提一点，或者放最下面
                bottom: showScroll ? 35 : 5, 
                type: 'scroll',
                pageIconColor: '#22d3ee',
                pageTextStyle: { color: '#9ca3af' }
            },
            grid: {
                top: '18%', left: '5%', right: '5%', 
                // ✅ 核心调整：底部留白动态计算，给滚动条留位置
                bottom: showScroll ? (is2D ? '18%' : '15%') : (is2D ? '12%' : '8%'),
                containLabel: true,
                show: false
            },
            // ✅ 核心新增：数据区域缩放组件 (DataZoom)
            dataZoom: [
                {
                    type: 'slider', // 滑块型数据区域缩放组件
                    show: showScroll, // 数据多时才显示
                    realtime: true,
                    startValue: 0, // 默认从第 0 个开始
                    endValue: 7,   // 默认显示到第 7 个 (共8个)，之后的需要拖动查看
                    height: 18,    // 滚动条高度
                    bottom: 5,     // 贴底显示
                    // // ✅ 开启阴影
                    // showDataShadow: true,
                    // // ✅ 自定义阴影样式 (赛博风格)
                    // dataBackground: {
                    //     // 线条样式
                    //     lineStyle: {
                    //         color: '#22d3ee', // 青色线条
                    //         width: 1,
                    //         opacity: 0.5
                    //     },
                    //     // 填充样式 (下方区域)
                    //     areaStyle: {
                    //         color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    //             { offset: 0, color: 'rgba(34, 211, 238, 0.5)' },
                    //             { offset: 1, color: 'rgba(34, 211, 238, 0.0)' }
                    //         ]),
                    //         opacity: 0.3
                    //     }
                    // },
                    // // 选中部分的样式 (即滑块中间被选中的区域)
                    // selectedDataBackground: {
                    //     lineStyle: { color: '#fff', width: 2 }, // 选中部分线条变白变亮
                    //     areaStyle: { color: '#22d3ee', opacity: 0.8 }
                    // },

                    // 样式定制：赛博朋克风滚动条
                    borderColor: 'transparent',
                    backgroundColor: 'rgba(255,255,255,0.05)', // 轨道背景
                    fillerColor: 'rgba(34, 211, 238, 0.2)',    // 选中区域颜色
                    handleStyle: {
                        color: '#22d3ee',
                        borderColor: '#22d3ee'
                    },
                    moveHandleStyle: {
                        color: '#22d3ee'
                    },
                    textStyle: { color: '#9ca3af' },
                    brushSelect: false // 禁用框选功能，纯滚动
                },
                {
                    type: 'inside', // 支持鼠标滚轮缩放/平移
                    enabled: showScroll,
                    zoomOnMouseWheel: false, // 禁用滚轮缩放，防止误操作地图
                    moveOnMouseWheel: true,  // 允许滚轮平移
                    moveOnMouseMove: true    // 允许按住拖动
                }
            ],
            xAxis: {
                type: 'category',
                data: xAxisData,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { 
                    color: '#d1d5db',
                    interval: 0,
                    // 有滚动条时，标签一般不需要倾斜了，因为显示数量可控
                    rotate: showScroll ? 0 : (dataLength > 8 ? 30 : 0), 
                    hideOverlap: true,
                    fontSize: 11,
                    margin: 15
                },
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { 
                    lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed', width: 1 } 
                },
                axisLabel: { color: '#6b7280', fontSize: 11 },
                nameGap: 20,
            },
            color: is2D ? NEON_PALETTE.map(p => p[0]) : ['#22d3ee'],
            series: series,
            animationDuration: 1000,
            animationEasing: 'cubicOut'
        };
    }, [pivotData, pivotConfig, generatedColumns, containerWidth]); 

    if (!isChartVisible || !pivotData || pivotData.length === 0) return null;

    return (
        <div 
            className="absolute bottom-8 left-8 z-1000 flex flex-col overflow-hidden
                       rounded-2xl transition-all duration-300 ease-out
                       bg-gray-950/40 backdrop-blur-xl 
                       border border-cyan-500/20 
                       shadow-[0_0_30px_rgba(0,0,0,0.5),inset_0_0_20px_rgba(34,211,238,0.05)]
                       group hover:border-cyan-500/40 hover:shadow-[0_0_40px_rgba(34,211,238,0.15)]
                       "
            // ✅ 这里的 width 现在最大只有 600px 了
            style={{ width: containerWidth, height: containerHeight }}
        >
            <div className="h-12 shrink-0 flex items-center justify-between px-5 select-none
                            border-b border-white/5 bg-linear-to-r from-transparent via-white/5 to-transparent">
                <div className="flex items-center text-cyan-300/90 font-bold text-base tracking-wider drop-shadow-[0_0_5px_rgba(34,211,238,0.3)]">
                    <BarChartOutlined className="mr-3 text-xl opacity-80" />
                    <span className="truncate max-w-[320px]">
                        <span className="text-white/70">{pivotConfig.groupByRow}</span>
                        {pivotConfig.groupByCol && <span className="mx-1 text-cyan-500/70">×</span>}
                        {pivotConfig.groupByCol && <span className="text-white/70">{pivotConfig.groupByCol}</span>}
                        <span className="ml-2 px-2 py-0.5 text-xs bg-cyan-950/50 text-cyan-400/80 rounded-full border border-cyan-800/50 uppercase">
                            Analysis
                        </span>
                    </span>
                </div>
                <Button 
                    type="text" 
                    shape="circle"
                    size="middle" 
                    className="flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    icon={<CloseOutlined className="text-sm" />} 
                    onClick={() => setChartVisible(false)}
                />
            </div>

            <div className="flex-1 w-full h-full p-3 relative">
                <ReactECharts 
                    option={getOption} 
                    style={{ height: '100%', width: '100%' }}
                    theme="dark"
                    autoResize={true}
                    notMerge={true}
                />
            </div>
        </div>
    );
};

export default ChartOverlay;