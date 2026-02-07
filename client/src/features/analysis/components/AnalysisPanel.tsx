import React from 'react';
import { Select, Button, Form, Divider, ConfigProvider, theme, App } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useAnalysisStore } from '../../../stores/useAnalysisStore';
import apiClient from '../../../services/apiClient';

const { Option } = Select;

interface AnalysisPanelProps {
    fileId: string;
    fields: string[]; 
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ fileId, fields }) => {
    // 2. 使用 App.useApp() 获取上下文感知的 message 实例
    // 这样它就能读取到 ConfigProvider 的主题配置，也不会报错了
    const { message } = App.useApp();
    const { 
        pivotConfig, 
        setPivotConfig, 
        setLoading, 
        setPivotResult, 
        setPivotPanelOpen,
        setChartVisible
    } = useAnalysisStore();

    const handleAnalyze = async () => {
        if (!fileId) {
            message.warning('请先在工作空间选择一个文件');
            return;
        }
        if (!pivotConfig.groupByRow) {
            message.warning('请至少选择行分组字段');
            return;
        }

        // ✅ 新增校验：如果不是计数模式，必须选择统计字段
        if (pivotConfig.method !== 'count' && !pivotConfig.valueField) {
            message.warning('请选择统计字段 (Value)');
            return;
        }

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
                setChartVisible(true);   // ✅ 新增：同时打开地图上的图表
                message.success('透视分析完成');
            }
        } catch (error) {
            console.error(error);
            message.error('分析失败，请检查网络');
        } finally {
            setLoading(false);
        }
    };

    if (!fileId) {
        return <div className="p-4 text-gray-500 text-sm text-center">请先选择一个文件以开始分析</div>;
    }

    return (
        <div className="p-4 flex flex-col h-full overflow-y-auto custom-scrollbar">
            <h3 className="text-base font-bold text-cyan-400 mb-4 flex items-center">
                <PlayCircleOutlined className="mr-2" /> 透视配置
            </h3>
            
            {/* ✅使用 token 配置颜色，删除 styles 属性 */}
            <ConfigProvider 
                theme={{ 
                    algorithm: theme.darkAlgorithm,
                    token: {
                        // colorBgElevated 控制下拉菜单、气泡弹窗等的背景色
                        colorBgElevated: '#1f2937', 
                        // 你还可以微调其他颜色，例如选中的背景色
                        controlItemBgActive: 'rgba(0, 229, 255, 0.15)',
                    }
                }}
            >
                <Form layout="vertical">
                    {/* 行分组 */}
                    <Form.Item label={<span className="text-gray-400 text-xs">行分组 (Row Group) *</span>}>
                        <Select
                            className="w-full"
                            placeholder="例如: District"
                            value={pivotConfig.groupByRow}
                            onChange={(val) => setPivotConfig({ groupByRow: val })}
                            // ✅ 删除了 styles={...}，ConfigProvider 会自动处理
                        >
                            {fields.map(f => <Option key={f} value={f}>{f}</Option>)}
                        </Select>
                    </Form.Item>

                    {/* 列分组 (可选) */}
                    <Form.Item label={<span className="text-gray-400 text-xs">列分组 (Column Group)</span>}>
                        <Select
                            className="w-full"
                            placeholder="例如: Year (可选)"
                            allowClear
                            value={pivotConfig.groupByCol}
                            onChange={(val) => setPivotConfig({ groupByCol: val })}
                        >
                            {fields.map(f => <Option key={f} value={f}>{f}</Option>)}
                        </Select>
                    </Form.Item>

                    {/* 统计数值 */}
                    <Form.Item label={<span className="text-gray-400 text-xs">统计字段 (Value)</span>}>
                        <Select
                            className="w-full"
                            placeholder="例如: GDP"
                            value={pivotConfig.valueField}
                            onChange={(val) => setPivotConfig({ valueField: val })}
                            disabled={pivotConfig.method === 'count'}
                        >
                            {fields.map(f => <Option key={f} value={f}>{f}</Option>)}
                        </Select>
                    </Form.Item>

                    {/* 聚合方式 */}
                    <Form.Item label={<span className="text-gray-400 text-xs">聚合方式 (Method)</span>}>
                        <Select
                            className="w-full"
                            value={pivotConfig.method}
                            onChange={(val) => setPivotConfig({ method: val })}
                        >
                            <Option value="count">计数 (Count)</Option>
                            <Option value="sum">求和 (Sum)</Option>
                            <Option value="avg">平均值 (Avg)</Option>
                            <Option value="max">最大值 (Max)</Option>
                            <Option value="min">最小值 (Min)</Option>
                        </Select>
                    </Form.Item>

                    <Divider className="bg-gray-700 my-4" />

                    <Button 
                        type="primary" 
                        block 
                        onClick={handleAnalyze}
                        className="bg-cyan-600 hover:bg-cyan-500 border-none font-bold"
                    >
                        开始透视分析
                    </Button>
                </Form>
            </ConfigProvider>
        </div>
    );
};

export default AnalysisPanel;