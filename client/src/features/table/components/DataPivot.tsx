import React, { useEffect, useState, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react'; 
import { type ColDef, ModuleRegistry, AllCommunityModule } from 'ag-grid-community'; 
import 'ag-grid-community/styles/ag-grid.css'; 
import 'ag-grid-community/styles/ag-theme-alpine.css'; 
import { Empty } from 'antd';
// 🚨【新增】引入 center 计算
import { center } from '@turf/turf';

// 注册模块
ModuleRegistry.registerModules([ AllCommunityModule ]);

interface DataPivotProps {
  data: any;          
  fileName: string;   
  // 🚨【新增】接收父组件传来的回调
  onRowClick?: (record: any) => void;
  // 🚨【新增】接收选中的 Feature
  selectedFeature?: any;
}

const DataPivot: React.FC<DataPivotProps> = ({ data, fileName, onRowClick, selectedFeature }) => {
  // 🚨【新增】Grid 引用，用于调用 API
  const gridRef = useRef<AgGridReact>(null);

  const [rowData, setRowData] = useState<any[]>([]);
  const [columnDefs, setColumnDefs] = useState<ColDef[]>([]);

  useEffect(() => {
    if (!data) {
      setRowData([]);
      setColumnDefs([]);
      return;
    }

    const ext = fileName.split('.').pop()?.toLowerCase();
    
    if (ext === 'json' || ext === 'geojson') {
      processGeoJSON(data);
    } else {
      if (Array.isArray(data)) {
        processArrayData(data);
      }
    }
    // 其他格式省略...
  }, [data, fileName]);

  // 🚨【核心修复】监听 selectedFeature，同步高亮表格行
  useEffect(() => {
    // 1. 先把 API 赋值给局部变量，解决 "gridRef.current is possibly null" 报错
    // 使用可选链 ?. 确保安全访问
    const api = gridRef.current?.api;

    // 2. 如果 api 不存在，直接结束
    if (!api) return;

    if (selectedFeature) {
        // 3. 使用局部变量 api 进行操作，TS 就不会报错了
        api.forEachNode((node) => {
            const nodeData = node.data;
            // 匹配逻辑：优先比对 ID，没有 ID 比对 Name
            const isMatch = (nodeData.id && nodeData.id === selectedFeature.id) || 
                            (nodeData.name && nodeData.name === selectedFeature.name);
            
            if (isMatch) {
                node.setSelected(true);
                api.ensureNodeVisible(node, 'middle'); // 滚动到该行
            }
        });
    } else {
        // 如果 selectedFeature 为空，取消所有选中
        api.deselectAll();
    }
  }, [selectedFeature]);

  /**
   * 通用列定义生成函数 (修复 Warning #48)
   */
  const generateColumnDefs = (rows: any[]) => {
    if (rows.length === 0) return [];

    const keys = Object.keys(rows[0]);
    return keys.map(key => ({
      field: key,
      headerName: key.toUpperCase(),
      sortable: true,
      filter: true,
      resizable: true,
      flex: 1,
      // 🚨【修复 2】解决 Warning #48
      // 如果值是对象或数组（比如 "cp": [120, 30]），转成字符串显示
      valueFormatter: (params: any) => {
        const val = params.value;
        if (typeof val === 'object' && val !== null) {
          return JSON.stringify(val); 
        }
        return val;
      }
    }));
  };

  const processGeoJSON = (geoData: any) => {
    if (geoData.type === 'FeatureCollection' && Array.isArray(geoData.features)) {
      const rows = geoData.features.map((feature: any) => {
        let cp = feature.properties.cp;
        
        // 1. 如果没有 cp 或 cp 是字符串，尝试修复
        if (typeof cp === 'string') {
            try { cp = JSON.parse(cp); } catch(e) {}
        }
        // 2. 依然没有，则计算
        if ((!cp || !Array.isArray(cp)) && feature.geometry) {
            try {
                const c = center(feature);
                cp = c.geometry.coordinates;
            } catch(e) {}
        }
        return {
          ...feature.properties,
          cp: cp, // 存好 cp 供地图使用
          _geometry: feature.geometry?.type || 'Unknown' 
        };
      });

      setRowData(rows);
      // 使用提取出来的通用函数
      setColumnDefs(generateColumnDefs(rows));
    } else {
        console.warn('不是标准的 FeatureCollection GeoJSON');
    }
  };

  const processArrayData = (arr: any[]) => {
      setRowData(arr);
      // 使用提取出来的通用函数
      setColumnDefs(generateColumnDefs(arr));
  }

  if (!data || rowData.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#1f2937] rounded text-gray-400">
         <Empty description={<span className="text-gray-400">请在左侧选择文件以查看属性表</span>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-2 px-2 text-xs text-blue-400 font-mono flex justify-between">
        <span>当前文件: {fileName}</span>
        <span>记录数: {rowData.length}</span>
      </div>

      <div className="ag-theme-alpine-dark flex-1 w-full h-full">
        {/* 🚨【核心修改】注入炫酷的选中样式 */}
        <style>{`
            .ag-theme-alpine-dark {
                --ag-background-color: #111827; 
                --ag-header-background-color: #1f2937; 
                --ag-odd-row-background-color: #111827;
                --ag-row-border-color: #374151;
                --ag-header-foreground-color: #9ca3af;
                --ag-foreground-color: #e5e7eb;
                
                /* 覆盖默认的选中行背景色 (改为半透明青色) */
                --ag-selected-row-background-color: rgba(0, 229, 255, 0.15) !important;
            }

            /* 表头加粗 */
            .ag-header-cell-label {
                font-weight: 600;
            }

            /* 🌟 自定义选中行的左侧高亮条 */
            .ag-theme-alpine-dark .ag-row-selected {
                border-left: 4px solid #00e5ff !important; /* 左侧亮条 */
                transition: all 0.2s;
            }

            /* 选中时文字变亮白，增加对比度 */
            .ag-theme-alpine-dark .ag-row-selected .ag-cell {
                color: white !important;
                text-shadow: 0 0 10px rgba(0, 229, 255, 0.3); /* 微微发光 */
            }

            /* 去掉单元格聚焦时的那个难看的蓝色粗框 */
            .ag-theme-alpine-dark .ag-cell-focus {
                border-color: transparent !important;
            }
        `}</style>
        
        <AgGridReact

            // 🚨【新增】绑定 ref
            ref={gridRef}

            // 🚨【修复 1】解决 Error #239
            // 加上这个属性，允许你继续使用 ag-theme-alpine.css 和你的自定义样式
            theme="legacy" 
            
            rowData={rowData}
            columnDefs={columnDefs}
            pagination={true}
            paginationPageSize={20}
            animateRows={true}

            // 🚨【关键修复】开启单行选中模式！
            // 没有这行代码，AG Grid 就不会给行添加 ag-row-selected 类，CSS 就不会生效
            rowSelection={{ mode: 'singleRow' }}

            // 🚨【新增】行点击事件
            onRowClicked={(params) => {
                if (onRowClick) {
                    onRowClick(params.data);
                }
            }}
        />
      </div>
    </div>
  );
};

export default DataPivot;