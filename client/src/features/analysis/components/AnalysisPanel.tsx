import React, { useState } from 'react';
import { Select, Button, Form, ConfigProvider, theme, App, Segmented } from 'antd';
import { 
    PlayCircleOutlined, 
    DotChartOutlined, 
    BarChartOutlined, 
    CalculatorOutlined,
    FunctionOutlined,
    ExperimentOutlined,
    AreaChartOutlined,
    DeploymentUnitOutlined, // ✅ [新增] 用这个图标代表山脊图/分段
    ThunderboltOutlined,
    BoxPlotOutlined // ✅ [新增] 引入图标
} from '@ant-design/icons';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import apiClient from '../../../services/apiClient';

const { Option } = Select;

interface AnalysisPanelProps {
    fileId: string;
    fields: string[]; 
}

type StatMode = 'Pivot' | 'Scatter';

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ fileId, fields }) => {
    const { message } = App.useApp();
    const { 
        pivotConfig, setPivotConfig, 
        scatterConfig, setScatterConfig, 
        setRawScatterData, setChartType, 
        setLoading, 
        setPivotResult, 
        setPivotPanelOpen,
        setChartVisible
    } = useAnalysisStore();

    const [statMode, setStatMode] = useState<StatMode>('Pivot');

    // --- 1. 透视分析逻辑 ---
    const handlePivotAnalyze = async () => {
        if (!fileId) { message.warning('请先在工作空间选择一个文件'); return; }
        if (!pivotConfig.groupByRow) { message.warning('请至少选择行分组字段'); return; }
        // ✅ [修改] 箱线图模式下也需要 valueField
        if (pivotConfig.method !== 'count' && !pivotConfig.valueField) { message.warning('请选择统计字段 (Value)'); return; }
        setLoading(true);
        try {
            const res = await apiClient.post('/analysis/pivot', {
                fileId: fileId,
                groupByRow: pivotConfig.groupByRow,
                groupByCol: pivotConfig.groupByCol,
                valueField: pivotConfig.valueField,
                method: pivotConfig.method
            });

            if (res.data.success) {
                setPivotResult(res.data.data, res.data.columns);
                setPivotPanelOpen(true);
                
                // ✅ [新增] 自动切换图表类型
                if (pivotConfig.method === 'boxplot') {
                    setChartType('BoxPlot'); 
                } else if (pivotConfig.method === 'ridgeline') {
                    setChartType('Ridgeline'); // 自动切到山脊图
                } else {
                    setChartType('Bar'); 
                }
                
                setChartVisible(true);
                message.success('透视分析完成');
            }
        } catch (error) {
            console.error(error);
            message.error('分析失败，请检查网络');
        } finally {
            setLoading(false);
        }
    };

    // --- 2. 散点分析逻辑 ---
    const handleScatterAnalyze = async () => {
        if (!fileId) { message.warning('请先选择文件'); return; }
        if (!scatterConfig.xField || !scatterConfig.yField) { message.warning('请选择 X 轴和 Y 轴字段'); return; }

        setLoading(true);
        try {
            const res = await apiClient.get(`/files/${fileId}/data`, {
                params: { page: 1, pageSize: 5000 }
            });

            if (res.data.code === 200) {
                const features = res.data.data.features;
                const rawData = features.map((f: any) => f.properties);
                setRawScatterData(rawData);
                setChartType('Scatter'); 
                setChartVisible(true);
                message.success(`已加载 ${rawData.length} 个数据点`);
            } else {
                message.error(res.data.message || '获取数据失败');
            }
        } catch (error) {
            console.error(error);
            message.error('获取数据失败');
        } finally {
            setLoading(false);
        }
    };

    if (!fileId) return <div className="p-8 text-gray-500 text-sm text-center flex flex-col items-center justify-center h-full opacity-50"><ExperimentOutlined className="text-4xl mb-4"/>请先选择一个文件以激活工具箱</div>;

    return (
        <div className="p-4 flex flex-col h-full overflow-y-auto custom-scrollbar gap-8">
            <ConfigProvider 
                theme={{ 
                    algorithm: theme.darkAlgorithm,
                    token: { 
                        colorBgElevated: '#1f2937', 
                        colorBgContainer: '#111827', 
                        colorBorder: '#374151',
                        controlItemBgActive: 'rgba(34, 211, 238, 0.1)',
                        colorPrimary: '#22d3ee',
                        borderRadius: 6
                    },
                    components: {
                        Segmented: {
                            itemSelectedBg: '#1f2937', 
                            itemSelectedColor: '#22d3ee',
                            trackBg: '#0b1121',
                            itemColor: '#6b7280'
                        }
                    }
                }}
            >
                {/* =========== 区域 1: 数据洞察 (DATA INSIGHTS) =========== */}
                <div className="flex flex-col gap-3">
                    {/* 区域标题 */}
                    <div className="flex items-center gap-2 px-1">
                        <AreaChartOutlined className="text-cyan-500" />
                        <span className="text-xs font-bold text-cyan-500/80 tracking-widest uppercase font-mono">
                            Data Insights
                        </span>
                        <div className="h-px flex-1 bg-linear-to-r from-cyan-900/50 to-transparent"></div>
                    </div>

                    {/* 卡片：统计探索 */}
                    <div className="rounded-xl overflow-hidden border border-cyan-800/30 bg-[#0b1121] shadow-lg shadow-cyan-900/5 hover:border-cyan-500/30 transition-all duration-300">
                        {/* Header: 青色系 */}
                        <div className="px-4 py-3 bg-linear-to-r from-cyan-950/30 to-transparent border-b border-cyan-900/30 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                    <BarChartOutlined />
                                </div>
                                <span className="text-sm font-bold text-gray-200">统计探索</span>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-4 bg-gray-900/20">
                            <Segmented<StatMode>
                                options={[
                                    { label: '数据透视', value: 'Pivot', icon: <BarChartOutlined /> },
                                    { label: '散点分布', value: 'Scatter', icon: <DotChartOutlined /> },
                                ]}
                                block
                                value={statMode}
                                onChange={setStatMode}
                                className="mb-5 border border-gray-800"
                            />

                            {/* Pivot Form */}
                            {statMode === 'Pivot' && (
                                <div className="animate-slide-up space-y-4">
                                    <Form layout="vertical" size="middle">
                                        <Form.Item label={<span className="text-gray-400 text-xs">行分组 (Row)</span>} className="mb-0">
                                            <Select className="w-full" placeholder="选择字段" value={pivotConfig.groupByRow} onChange={(val) => setPivotConfig({ groupByRow: val })} showSearch optionFilterProp="children">
                                                {fields.map(f => <Option key={f} value={f}>{f}</Option>)}
                                            </Select>
                                        </Form.Item>
                                        <div className="grid grid-cols-2 gap-3 mt-3">
                                            <Form.Item label={<span className="text-gray-400 text-xs">列分组 (Col)</span>} className="mb-0">
                                                <Select 
                                                    className="w-full" placeholder="可选" allowClear 
                                                    value={pivotConfig.groupByCol} 
                                                    onChange={(val) => setPivotConfig({ groupByCol: val })} 
                                                    showSearch
                                                    // ✅ [修改] 分段模式下禁用列
                                                    disabled={pivotConfig.method === 'boxplot' || pivotConfig.method === 'ridgeline'}
                                                >
                                                    {fields.map(f => <Option key={f} value={f}>{f}</Option>)}
                                                </Select>   
                                            </Form.Item>
                                            <Form.Item label={<span className="text-gray-400 text-xs">聚合方式</span>} className="mb-0">
                                                <Select className="w-full" value={pivotConfig.method} onChange={(val) => {
                                                    setPivotConfig({ 
                                                        method: val,
                                                        // ✅ [修改] 选中 raw 模式时清空列
                                                        groupByCol: (val === 'boxplot' || val === 'ridgeline') ? null : pivotConfig.groupByCol
                                                    })
                                                }}>
                                                    <Option value="count">计数</Option>
                                                    <Option value="sum">求和</Option>
                                                    <Option value="avg">平均</Option>
                                                    <Option value="max">最大</Option>
                                                    <Option value="min">最小</Option>
                                                    <Option value="boxplot">
                                                        <span className="flex items-center gap-2">
                                                            <BoxPlotOutlined className="text-purple-400"/>
                                                            <span>箱线图(分布)</span>
                                                        </span>
                                                    </Option>
                                                    {/* ✅ [新增] 分段/山脊图选项 */}
                                                    <Option value="ridgeline">
                                                        <span className="flex items-center gap-2">
                                                            <DeploymentUnitOutlined className="text-emerald-400"/>
                                                            <span>山脊图(分布)</span>
                                                        </span>
                                                    </Option>
                                                </Select>
                                            </Form.Item>
                                        </div>
                                        <Form.Item label={<span className="text-gray-400 text-xs">统计值 (Value)</span>} className="mt-3 mb-5">
                                            <Select 
                                                className="w-full" 
                                                placeholder="选择字段" 
                                                value={pivotConfig.valueField} 
                                                onChange={(val) => setPivotConfig({ valueField: val })} 
                                                // ✅ [修改] boxplot 模式下也必须选字段
                                                disabled={pivotConfig.method === 'count'} 
                                                showSearch
                                            >
                                                {fields.map(f => <Option key={f} value={f}>{f}</Option>)}
                                            </Select>
                                        </Form.Item>
                                        <Button type="primary" block onClick={handlePivotAnalyze} icon={<PlayCircleOutlined />} className="h-9 bg-cyan-700 hover:bg-cyan-600 border-none shadow-lg shadow-cyan-900/30">
                                            执行透视分析
                                        </Button>
                                    </Form>
                                </div>
                            )}

                            {/* Scatter Form */}
                            {statMode === 'Scatter' && (
                                <div className="animate-slide-up space-y-4">
                                    <Form layout="vertical" size="middle">
                                        <Form.Item label={<span className="text-gray-400 text-xs">X 轴字段</span>} className="mb-0">
                                            <Select className="w-full" placeholder="选择字段" value={scatterConfig.xField} onChange={(val) => setScatterConfig({ xField: val })} showSearch>
                                                {fields.map(f => <Option key={f} value={f}>{f}</Option>)}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item label={<span className="text-gray-400 text-xs">Y 轴字段</span>} className="mt-3 mb-5">
                                            <Select className="w-full" placeholder="选择字段" value={scatterConfig.yField} onChange={(val) => setScatterConfig({ yField: val })} showSearch>
                                                {fields.map(f => <Option key={f} value={f}>{f}</Option>)}
                                            </Select>
                                        </Form.Item>
                                        <Button type="primary" block onClick={handleScatterAnalyze} icon={<DotChartOutlined />} className="h-9 bg-purple-700 hover:bg-purple-600 border-none shadow-lg shadow-purple-900/30">
                                            生成散点图
                                        </Button>
                                    </Form>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* =========== 区域 2: 空间计算 (SPATIAL COMPUTE) =========== */}
                <div className="flex flex-col gap-3">
                    {/* 区域标题 - 使用不同的颜色 (Emerald/Green) */}
                    <div className="flex items-center gap-2 px-1">
                        <ThunderboltOutlined className="text-emerald-500" />
                        <span className="text-xs font-bold text-emerald-500/80 tracking-widest uppercase font-mono">
                            Spatial Compute
                        </span>
                        <div className="h-px flex-1 bg-linear-to-r from-emerald-900/50 to-transparent"></div>
                    </div>

                    {/* 卡片：模型函数 */}
                    <div className="rounded-xl overflow-hidden border border-emerald-800/30 bg-[#0b1121] shadow-lg shadow-emerald-900/5 hover:border-emerald-500/30 transition-all duration-300">
                        {/* Header: 绿色系 */}
                        <div className="px-4 py-3 bg-linear-to-r from-emerald-950/30 to-transparent border-b border-emerald-900/30 flex items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <FunctionOutlined />
                                </div>
                                <span className="text-sm font-bold text-gray-200">几何模型</span>
                            </div>
                        </div>
                        
                        {/* Content - 工具箱风格 */}
                        <div className="p-4 bg-gray-900/20">
                            <div className="grid grid-cols-2 gap-3">
                                <Button type="dashed" className="h-20 border-gray-800 bg-gray-900/50 text-gray-400 hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-950/20 flex flex-col items-center justify-center gap-2 group transition-all">
                                    <CalculatorOutlined className="text-xl group-hover:scale-110 transition-transform"/>
                                    <span className="text-xs">缓冲区分析</span>
                                </Button>
                                <Button type="dashed" className="h-20 border-gray-800 bg-gray-900/50 text-gray-400 hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-950/20 flex flex-col items-center justify-center gap-2 group transition-all">
                                    <ExperimentOutlined className="text-xl group-hover:scale-110 transition-transform"/>
                                    <span className="text-xs">叠加分析</span>
                                </Button>
                            </div>
                            <div className="mt-3 text-center">
                                <span className="text-[10px] text-gray-600 bg-gray-900 px-2 py-1 rounded border border-gray-800">
                                    更多模型函数开发中...
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

            </ConfigProvider>

            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slideUp 0.3s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

export default AnalysisPanel;