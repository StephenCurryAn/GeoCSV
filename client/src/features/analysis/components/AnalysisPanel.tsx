import React, { useState, useEffect } from 'react';
import { Select, Button, Form, ConfigProvider, theme, App, Segmented, Tooltip, Modal, Input, Typography, Spin } from 'antd';
import { 
    PlayCircleOutlined, 
    DotChartOutlined, 
    BarChartOutlined, 
    FunctionOutlined,
    ExperimentOutlined,
    AreaChartOutlined,
    DeploymentUnitOutlined, // ✅ [新增] 用这个图标代表山脊图/分段
    ThunderboltOutlined,
    BoxPlotOutlined, // ✅ [新增] 引入图标
    // ✅ [新增] AI 控制台所需图标
    RobotOutlined, 
    CodeOutlined, 
    ShakeOutlined, 
    CheckCircleOutlined
} from '@ant-design/icons';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import apiClient from '../../../services/apiClient';
import { geoService } from '../../../services/geoService';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

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

    // 🌟 1. 增加模型列表状态
    const [availableModels, setAvailableModels] = useState<any[]>([]);

    // 🌟 2. 增加拉取模型列表的副作用函数
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await apiClient.get('/analysis/models');
                if (res.data.code === 200) {
                    setAvailableModels(res.data.data);
                }
            } catch (error) {
                console.error('获取可用模型失败:', error);
            }
        };
        fetchModels();
    }, []); // 空依赖数组，组件挂载时拉取一次即可

    // === AI 建模控制台专属 State ===
    const [isAIModalVisible, setIsAIModalVisible] = useState(false);
    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [form] = Form.useForm();

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

    // 触发 AI 生成
    const handleAIGenerate = async () => {
        try {
        const values = await form.validateFields();
        setIsAIGenerating(true);
        setGeneratedCode(null); // 清空上次的代码

        // 呼叫后端大模型
        const response = await geoService.generateModelByAI(values);
        
        message.success(response.message || '模型生成成功！');
        setGeneratedCode(response.previewCode); // 渲染炫酷的 Python 代码
        
        // 注意：这里不要立刻关闭弹窗，让用户欣赏一下 AI 写的代码！

        } catch (error: any) {
        if (error.errorFields) return; // 表单校验失败不提示
        message.error(error.response?.data?.error || 'AI 生成失败，请重试');
        } finally {
        setIsAIGenerating(false);
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
                                <span className="text-sm font-bold text-gray-200">统计分析</span>
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
                                <span className="text-sm font-bold text-gray-200">模型函数</span>
                            </div>
                        </div>
                        
                        {/* Content - 工具箱风格 */}
                        <div className="p-4 bg-gray-900/20">
                            <div className="grid grid-cols-2 gap-3">
                                {availableModels.length > 0 ? (
                                    availableModels.map((model) => (
                                        <Tooltip 
                                            key={model.modelName}
                                            placement="top" 
                                            color="#022c22" // 深邃内敛的暗绿色背景，专业不刺眼
                                            mouseEnterDelay={0.3} 
                                            title={
                                                <div className="flex flex-col gap-1.5 p-1 max-w-50">
                                                    <div className="text-base font-bold text-emerald-400 border-b border-emerald-800/50 pb-1">
                                                        {model.displayName || model.modelName}
                                                    </div>
                                                    <div className="text-sm text-gray-300 leading-relaxed">
                                                        {model.description}
                                                    </div>
                                                    <div className="mt-1 px-2 py-1 bg-black/50 rounded border border-emerald-800/80 font-mono text-sm text-emerald-400 break-all shadow-[0_0_8px_rgba(52,211,153,0.1)_inset]">
                                                        输入： ={model.modelName}(...)
                                                    </div>
                                                </div>
                                            }
                                        >
                                            <div 
                                                className="relative cursor-pointer h-12 flex items-center justify-center bg-[#0b1121] border border-emerald-900/50 rounded-md overflow-hidden group hover:border-emerald-500/50 hover:bg-emerald-950/40 transition-all duration-300 hover:shadow-[0_0_12px_rgba(16,185,129,0.15)] hover:-translate-y-0.5"
                                            >
                                                {/* 左侧动态发光条 (默认极暗，悬浮瞬间亮起纯正祖母绿) */}
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-950 group-hover:bg-emerald-400 transition-colors duration-300"></div>
                                                
                                                {/* 🌟 模型核心指令名称: text-sm(与标题同大), font-bold, tracking-wide(微调字间距显得精致) */}
                                                <span className="text-sm font-bold tracking-wide text-emerald-400 group-hover:text-emerald-300 transition-colors duration-300 drop-shadow-sm">
                                                    {model.modelName}
                                                </span>
                                                
                                                {/* 右上角赛博朋克装饰角标 */}
                                                <div className="absolute top-0 right-0 w-2 h-2 border-l border-b border-emerald-900/50 group-hover:border-emerald-400/60 transition-colors duration-300"></div>
                                                {/* 右下角装饰点 */}
                                                <div className="absolute bottom-1 right-1 w-0.5 h-0.5 bg-emerald-900/60 group-hover:bg-emerald-400/80 transition-colors duration-300 rounded-full"></div>
                                            </div>
                                        </Tooltip>
                                    ))
                                ) : (
                                    // 加载中或无模型时的占位
                                    <div className="col-span-2 text-center py-6 text-gray-500 text-xs">
                                        <ThunderboltOutlined className="animate-pulse text-lg mb-2 block text-emerald-700"/>
                                        正在同步云端模型库...
                                    </div>
                                )}
                            </div>
                            
                            {/* 底部提示
                            <div className="mt-4 text-center">
                                <span className="text-[12px] text-emerald-400 bg-emerald-950/20 px-3 py-1.5 rounded-full border border-emerald-900/30">
                                    在表格单元格输入   <b className="text-emerald-400">=模型名称(列名)</b>   即可调用
                                </span>
                            </div> */}

                        </div>
                    </div>
                </div>

                {/* =========== 区域 3: GeoAI 智能体 (GeoAI AGENT) - ✅ 全新炫酷区域 =========== */}
                <div className="flex flex-col gap-3 pb-8">
                    <div className="flex items-center gap-2 px-1">
                        <RobotOutlined className="text-blue-500" />
                        <span className="text-xs font-bold text-blue-500/80 tracking-widest uppercase font-mono">GeoAI Agent</span>
                        <div className="h-px flex-1 bg-linear-to-r from-blue-900/50 to-transparent"></div>
                    </div>

                    <div className="rounded-xl overflow-hidden border border-blue-800/30 bg-[#0b1121] shadow-lg shadow-blue-900/10 hover:border-blue-500/40 transition-all duration-300 relative group">
                        {/* 左侧幽蓝色霓虹呼吸灯 */}
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 shadow-[0_0_12px_#3b82f6] group-hover:shadow-[0_0_20px_#60a5fa] transition-all duration-500"></div>
                        
                        <div className="p-5 bg-linear-to-br from-blue-950/20 via-transparent to-purple-900/10">
                            <h3 className="text-sm font-bold text-gray-200 mb-2 flex items-center">
                                <ShakeOutlined className="mr-2 text-blue-400 animate-pulse" /> 智能模型铸造厂
                            </h3>
                            <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                                无需编写代码。用自然语言描述分析逻辑，大语言模型将实时生成、编译并自动挂载专属的 Python 地理分析算子。
                            </p>
                            <Button 
                                type="primary" 
                                icon={<ShakeOutlined />} 
                                className="w-full h-10 font-bold tracking-wide bg-linear-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 border-none shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all duration-300"
                                onClick={() => setIsAIModalVisible(true)}
                            >
                                唤醒 GeoAI 智能体
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 🌟 核心：AI 对话与代码预览 Modal (依然被 ConfigProvider 的暗色主题包裹) */}
                <Modal
                    title={
                        <div className="flex items-center text-blue-400 font-mono tracking-wide">
                            <RobotOutlined className="mr-2 text-xl" /> 
                            <span>AGENT FORGE TERMINAL</span>
                        </div>
                    }
                    open={isAIModalVisible}
                    onCancel={() => setIsAIModalVisible(false)}
                    footer={null} 
                    width={680}
                    styles={{
                        body: { backgroundColor: '#0f172a', padding: '24px', color: '#e5e7eb' },
                        header: { backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b', padding: '16px 24px' }
                    }}
                    closeIcon={<span className="text-gray-500 hover:text-blue-400 transition-colors">✖</span>}
                >
                    <Form form={form} layout="vertical" className="mt-2">
                        <div className="grid grid-cols-2 gap-4">
                            <Form.Item 
                                name="modelName" 
                                label={<span className="text-gray-400 font-mono text-xs">MODEL_NAME (大写英文)</span>}
                                rules={[{ required: true, message: '必须输入英文模型名' }]}
                            >
                                <Input placeholder="例如: WATER_RISK" className="bg-slate-800/50 border-slate-700 text-blue-300 font-mono hover:border-blue-500 focus:border-blue-500 focus:shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
                            </Form.Item>
                            
                            <Form.Item 
                                name="displayName" 
                                label={<span className="text-gray-400 font-mono text-xs">DISPLAY_NAME (中文名称)</span>}
                                rules={[{ required: true }]}
                            >
                                <Input placeholder="例如: 洪涝灾害风险指数" className="bg-slate-800/50 border-slate-700 text-gray-200 hover:border-blue-500 focus:border-blue-500 focus:shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
                            </Form.Item>
                        </div>

                        <Form.Item 
                            name="userDescription" 
                            label={<span className="text-gray-400 font-mono text-xs flex items-center"><CodeOutlined className="mr-1"/> PROMPT_DESCRIPTION (算法逻辑描述)</span>}
                            rules={[{ required: true, message: '请描述您的算法需求' }]}
                        >
                            <TextArea 
                                rows={4} 
                                placeholder="请描述底层计算逻辑。例如：&#10;将第一列与第二列相加，然后乘以0.8，若结果大于100则截断为100。" 
                                className="bg-slate-800/50 border-slate-700 text-gray-200 hover:border-blue-500 focus:border-blue-500 focus:shadow-[0_0_8px_rgba(59,130,246,0.3)] leading-relaxed"
                            />
                        </Form.Item>

                        {!generatedCode && (
                            <Form.Item className="mb-0 mt-6 text-right">
                                <Button 
                                    type="primary" 
                                    onClick={handleAIGenerate} 
                                    loading={isAIGenerating}
                                    className={`h-10 px-8 font-bold tracking-wide bg-linear-to-r from-blue-600 to-indigo-600 border-none ${isAIGenerating ? 'opacity-80' : 'hover:shadow-[0_0_20px_rgba(79,70,229,0.5)]'}`}
                                >
                                    {isAIGenerating ? 'NEURAL NETWORK COMPUTING...' : 'INITIATE GENERATION'}
                                </Button>
                            </Form.Item>
                        )}
                    </Form>

                    {/* 加载中的极客动画 */}
                    {isAIGenerating && (
                       <div className="mt-8 flex flex-col items-center justify-center p-10 border border-dashed border-slate-700 rounded-lg bg-slate-900/50">
                          <Spin size="large" />
                          <p className="mt-5 text-blue-400 font-mono text-xs tracking-widest animate-pulse">COMPILING PYTHON KERNEL...</p>
                       </div>
                    )}

                    {/* 代码生成完毕后的终端展示区 */}
                    {generatedCode && !isAIGenerating && (
                        <div className="mt-6 animate-fade-in-up">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-emerald-400 text-sm font-mono flex items-center">
                                    <CheckCircleOutlined className="mr-2" /> BUILD SUCCESSFUL
                                </span>
                                <span className="text-slate-500 text-xs font-mono bg-slate-800 px-2 py-1 rounded">./models/{form.getFieldValue('modelName').toLowerCase()}.py</span>
                            </div>
                            
                            {/* MacOS 风格终端 */}
                            <div className="rounded-lg overflow-hidden bg-[#0d1117] border border-slate-700 shadow-2xl">
                                <div className="flex px-4 py-2 bg-[#161b22] border-b border-slate-700 items-center">
                                    <div className="flex gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                                        <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                                        <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                                    </div>
                                    <span className="ml-auto text-slate-500 text-xs font-mono flex items-center gap-1">
                                        <CodeOutlined /> Generated by DeepSeek-Coder
                                    </span>
                                </div>
                                <div className="p-5 overflow-x-auto max-h-64 overflow-y-auto custom-scrollbar">
                                    <pre className="text-[13px] font-mono leading-relaxed text-emerald-400 m-0">
                                        <code>{generatedCode}</code>
                                    </pre>
                                </div>
                            </div>

                            <div className="mt-5 text-center p-3 bg-blue-900/20 rounded border border-blue-900/50">
                                <Text className="text-slate-300 text-xs">
                                    模型已热挂载。在左侧表格单元格中输入 <b className="text-blue-400 font-mono text-sm tracking-wider px-1">={form.getFieldValue('modelName')}(列名)</b> 立即执行计算！
                                </Text>
                            </div>
                            
                            <div className="mt-5 flex justify-end">
                                <Button 
                                    onClick={() => {
                                        setIsAIModalVisible(false);
                                        setGeneratedCode(null);
                                        form.resetFields();
                                    }}
                                    className="bg-slate-700 text-white border-none hover:bg-slate-600 font-mono text-xs tracking-widest px-6"
                                >
                                    CLOSE & EXECUTE
                                </Button>
                            </div>
                        </div>
                    )}
                </Modal>

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