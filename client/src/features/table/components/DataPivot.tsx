import React, { useEffect, useState, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react'; 
import { type ColDef, ModuleRegistry, AllCommunityModule } from 'ag-grid-community'; 
import 'ag-grid-community/styles/ag-grid.css'; 
import 'ag-grid-community/styles/ag-theme-alpine.css'; 
// ... 引入 antd 组件
import { Empty, Button, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined, TableOutlined, MinusSquareOutlined, DownloadOutlined } from '@ant-design/icons';
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
  // 🚨【新增】数据变更回调 (通知父组件保存)
  onDataChange?: (rowIndex: number, newData: any) => void;
  // 🚨【新增】操作回调
  onAddRow?: () => void;
  onDeleteRow?: (rowIndex: number) => void;
  onAddColumn?: () => void;
  onDeleteColumn?: (fieldName: string) => void;
}

const DataPivot: React.FC<DataPivotProps> = ({ data, fileName, onRowClick, selectedFeature, onDataChange, onAddRow, onDeleteRow, onAddColumn, onDeleteColumn }) => {
  // 🚨【新增】Grid 引用，用于调用 API
  const gridRef = useRef<AgGridReact>(null);

  const [rowData, setRowData] = useState<any[]>([]);
  const [columnDefs, setColumnDefs] = useState<ColDef[]>([]);
  // 记录当前选中的行索引，用于删除行
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!data) {
      setRowData([]);
      setColumnDefs([]);
      return;
    }

    const ext = fileName.split('.').pop()?.toLowerCase();
    
    if (
        ext === 'json' || 
        ext === 'geojson' || 
        ext === 'shp' || 
        (data.type === 'FeatureCollection' && Array.isArray(data.features))
    ) {
      processGeoJSON(data);
    } else {
      // 处理普通数组 (CSV/Excel 转换来的)
      if (Array.isArray(data)) {
        processArrayData(data);
      }
    }

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
    // 定义不可编辑的字段 (例如 ID 和 坐标)
    const readOnlyFields = ['id', '_geometry', 'cp', '_cp'];
    const keys = Object.keys(rows[0]);
    return keys
      .filter(k => !['_cp'].includes(k))
      .map(key => ({
        field: key,
        // 🚨【修改点 2】自定义表头名称 (让显示更友好)
        headerName: (() => {
            if (key === '_geometry') return '图层类型';
            if (key === 'cp') return '中心坐标';
            return key.toUpperCase();
        })(),
        sortable: true,
        filter: true,
        resizable: true,
        flex: 1,

        // 🚨【关键】开启编辑！
        // 只有不在 readOnlyFields 里的字段可以编辑
        editable: !readOnlyFields.includes(key),
        // 编辑器配置 (默认是文本框，也可以配下拉框等)
        cellEditor: 'agTextCellEditor',

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

  // 🚨【修改 2】新增：导出 CSV 处理函数
  const handleExportCSV = () => {
    if (gridRef.current && gridRef.current.api) {
        // 使用 AG Grid 原生导出功能
        gridRef.current.api.exportDataAsCsv({
            // 自定义文件名：原文件名_时间戳.csv
            fileName: `${fileName || 'data'}_${Date.now()}.csv`,
            // 仅导出可见列 (如果不想要隐藏列，设为 true)
            allColumns: false, 
        });
        message.success('正在导出 CSV...');
    } else {
        message.error('表格未就绪，无法导出');
    }
  };

  if (!data || rowData.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#1f2937] rounded text-gray-400">
         <Empty description={<span className="text-gray-400">请在左侧选择文件以查看属性表</span>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* <div className="mb-2 px-2 text-xs text-blue-400 font-mono flex justify-between">
        <span>当前文件: {fileName}</span>
        <span>记录数: {rowData.length}</span>
      </div> */}

      {/* 🚨【新增】工具栏 */}
      <div className="bg-[#1f2937] p-2 border-b border-gray-700 flex justify-between items-center">
        <div className="text-xs text-blue-400 font-mono">
          <span>{fileName}</span>
          <span className="ml-2 text-gray-500">({rowData.length} records)</span>
        </div>
        
        {/* 操作按钮组 */}
        <Space size="small">
            {/* 🚨【修改 3】在“增行”左边添加“导出CSV”按钮 */}
            <Button 
                size="small" 
                icon={<DownloadOutlined />} 
                className="bg-green-700! text-gray-200! border-green-600! hover:bg-green-600! hover:border-green-500!"
                onClick={handleExportCSV}
                disabled={rowData.length === 0} // 无数据时禁用
            >
                导出CSV
            </Button>

            <Button 
                type="primary" 
                size="small" 
                icon={<PlusOutlined />} 
                onClick={onAddRow}
                disabled={!onAddRow}
            >
                增行
            </Button>
            
            <Popconfirm 
                title="确定删除选中行吗？" 
                onConfirm={() => {
                    if (selectedRowIndex !== null && onDeleteRow) {
                        onDeleteRow(selectedRowIndex);
                        setSelectedRowIndex(null); // 删除后重置
                    } else {
                        message.warning('请先选中一行');
                    }
                }}
            >
                <Button 
                    type="primary" 
                    danger 
                    size="small" 
                    icon={<DeleteOutlined />}
                    disabled={selectedRowIndex === null}
                >
                    删行
                </Button>
            </Popconfirm>

            <div className="w-px h-4 bg-gray-600 mx-1"></div>

            <Button 
                size="small" 
                icon={<TableOutlined />} 
                className="bg-gray-700 text-white border-gray-600"
                onClick={onAddColumn}
            >
                增列
            </Button>
            
            <Button 
                size="small" 
                icon={<MinusSquareOutlined />} 
                className="bg-gray-700 text-white border-gray-600"
                onClick={() => {
                   // 简单的交互：让用户输入要删除的列名 (进阶版应该做一个下拉选框Modal)
                   const col = prompt("请输入要删除的列名（注意：id, name, cp 禁止删除）:");
                   if (col && onDeleteColumn) onDeleteColumn(col);
                }}
            >
                删列
            </Button>
        </Space>
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

            /* 🚨 修复复选框在暗色模式下的可见性 */
            .ag-checkbox-input-wrapper {
                font-size: 14px;
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

            // 🚨 监听行选中，为了获取要删除的行号
            onRowSelected={(event) => {
                if (event.node.isSelected() && event.node.rowIndex !== null) {
                    setSelectedRowIndex(event.node.rowIndex);
                }
            }}

            // 🚨【关键修改 1】明确配置选择模式和复选框
            // checkboxes: true 确保每行前面都有框 (虽然你可能通过其他方式实现了，但这样写最稳)
            // headerCheckbox: false 禁用全选，因为我们做的是单选联动
            rowSelection={{ 
                mode: 'singleRow', 
                checkboxes: true,
            }}
            
            // 🚨【关键修改 2】使用 onSelectionChanged 替代 onRowClicked
            // 无论点击行、复选框还是键盘操作，只要选中变了，这里都会触发
            onSelectionChanged={(event) => {
                // 🛑 防死循环：如果选中操作是由 API 触发的（比如点击地图导致表格更新），就不再回传
                if (event.source === 'api') return;

                const selectedRows = event.api.getSelectedRows();
                if (onRowClick) {
                    if (selectedRows.length > 0) {
                        onRowClick(selectedRows[0]);
                    } else {
                        // 如果取消选中（点击复选框取消），通知父组件清空
                        onRowClick(null);
                    }
                }
            }}

            // 🚨【关键修改】监听单元格修改完成事件
            onCellValueChanged={(event) => {
                console.log('单元格已修改:', event);
                if (onDataChange) {
                    // event.node.rowIndex 是行号
                    // event.data 是修改后的这一行完整数据
                    if (event.node.rowIndex !== null && event.node.rowIndex !== undefined) {
                        onDataChange(event.node.rowIndex, event.data);
                    }
                }
            }}
        />
      </div>
    </div>
  );
};

export default DataPivot;