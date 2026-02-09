import { create } from 'zustand';

// 透视配置接口
export interface PivotConfig {
    groupByRow: string | null;
    groupByCol: string | null;
    valueField: string | null;
    method: 'sum' | 'avg' | 'count' | 'max' | 'min';
}

// ✅ 新增：散点图配置接口
export interface ScatterConfig {
    xField: string | null;
    yField: string | null;
}

// ✅ 新增：图表类型定义
export type ChartType = 'Bar' | 'Radar' | 'Scatter' | 'Pie';

interface AnalysisState {
    // --- 透视相关 ---
    pivotConfig: PivotConfig;
    setPivotConfig: (config: Partial<PivotConfig>) => void;
    pivotData: any[] | null;
    generatedColumns: string[]; 
    setPivotResult: (data: any[], cols: string[]) => void;

    // --- ✅ 新增：散点图相关 ---
    scatterConfig: ScatterConfig;
    setScatterConfig: (config: Partial<ScatterConfig>) => void;
    rawScatterData: any[] | null; // 存储未聚合的原始数据
    setRawScatterData: (data: any[]) => void;

    // --- ✅ 新增：全局图表状态 ---
    chartType: ChartType;
    setChartType: (type: ChartType) => void;

    // --- 通用状态 ---
    isLoading: boolean;
    setLoading: (loading: boolean) => void;
    isPivotPanelOpen: boolean;
    setPivotPanelOpen: (isOpen: boolean) => void;
    isChartVisible: boolean;
    setChartVisible: (visible: boolean) => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
    // Pivot Defaults
    pivotConfig: {
        groupByRow: null,
        groupByCol: null,
        valueField: null,
        method: 'count',
    },
    setPivotConfig: (config) => set((state) => ({ 
        pivotConfig: { ...state.pivotConfig, ...config } 
    })),
    pivotData: null,
    generatedColumns: [],
    setPivotResult: (data, cols) => set({ pivotData: data, generatedColumns: cols }),

    // Scatter Defaults
    scatterConfig: {
        xField: null,
        yField: null,
    },
    setScatterConfig: (config) => set((state) => ({ 
        scatterConfig: { ...state.scatterConfig, ...config } 
    })),
    rawScatterData: null,
    setRawScatterData: (data) => set({ rawScatterData: data }),

    // Global Chart State
    chartType: 'Bar',
    setChartType: (type) => set({ chartType: type }),

    isLoading: false,
    setLoading: (loading) => set({ isLoading: loading }),
    isPivotPanelOpen: false,
    setPivotPanelOpen: (isOpen) => set({ isPivotPanelOpen: isOpen }),
    isChartVisible: false, 
    setChartVisible: (visible) => set({ isChartVisible: visible }),
}));