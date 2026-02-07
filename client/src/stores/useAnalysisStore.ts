import { create } from 'zustand';

// 透视配置接口
export interface PivotConfig {
    groupByRow: string | null;
    groupByCol: string | null;
    valueField: string | null;
    method: 'sum' | 'avg' | 'count' | 'max' | 'min';
}

interface AnalysisState {
    // 配置
    pivotConfig: PivotConfig;
    setPivotConfig: (config: Partial<PivotConfig>) => void;

    // 结果
    pivotData: any[] | null;
    generatedColumns: string[]; // 动态生成的列名 (e.g. "2020", "2021")
    setPivotResult: (data: any[], cols: string[]) => void;

    // 状态
    isLoading: boolean;
    setLoading: (loading: boolean) => void;

    // 面板控制 (中间下半部分)
    isPivotPanelOpen: boolean;
    setPivotPanelOpen: (isOpen: boolean) => void;

    // ✅ 新增：控制地图上的 HUD 图表是否显示
    isChartVisible: boolean;
    setChartVisible: (visible: boolean) => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
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

    isLoading: false,
    setLoading: (loading) => set({ isLoading: loading }),

    isPivotPanelOpen: false,
    setPivotPanelOpen: (isOpen) => set({ isPivotPanelOpen: isOpen }),

    // ✅ 新增：控制地图上的 HUD 图表是否显示
    isChartVisible: false, // 默认不显示，分析完成后设为 true
    setChartVisible: (visible) => set({ isChartVisible: visible }),
}));