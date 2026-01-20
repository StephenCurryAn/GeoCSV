import React, { useEffect, useState } from 'react';
import { AgGridReact } from 'ag-grid-react'; 
import { type ColDef, ModuleRegistry, AllCommunityModule } from 'ag-grid-community'; 
import 'ag-grid-community/styles/ag-grid.css'; 
import 'ag-grid-community/styles/ag-theme-alpine.css'; 
import { Empty } from 'antd';

// 注册模块
ModuleRegistry.registerModules([ AllCommunityModule ]);

interface DataPivotProps {
  data: any;          
  fileName: string;   
}

const DataPivot: React.FC<DataPivotProps> = ({ data, fileName }) => {
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
        return {
          ...feature.properties,
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
        <style>{`
            .ag-theme-alpine-dark {
                --ag-background-color: #111827; 
                --ag-header-background-color: #1f2937; 
                --ag-odd-row-background-color: #111827;
                --ag-row-border-color: #374151;
                --ag-header-foreground-color: #9ca3af;
                --ag-foreground-color: #e5e7eb;
            }
            .ag-header-cell-label {
                font-weight: 600;
            }
        `}</style>
        
        <AgGridReact
            // 🚨【修复 1】解决 Error #239
            // 加上这个属性，允许你继续使用 ag-theme-alpine.css 和你的自定义样式
            theme="legacy" 
            
            rowData={rowData}
            columnDefs={columnDefs}
            pagination={true}
            paginationPageSize={20}
            animateRows={true}
        />
      </div>
    </div>
  );
};

export default DataPivot;