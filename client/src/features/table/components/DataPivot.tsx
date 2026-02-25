import 'ag-grid-community/styles/ag-grid.css'; 
import 'ag-grid-community/styles/ag-theme-alpine.css'; 
import React, { useEffect, useState, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react'; 
import { type ColDef, ModuleRegistry, AllCommunityModule } from 'ag-grid-community'; 
import { App, Empty, Button, Space, Popconfirm, Pagination } from 'antd'; // ... 引入 antd 组件
import { PlusOutlined, DeleteOutlined, TableOutlined, MinusSquareOutlined, DownloadOutlined } from '@ant-design/icons';
// import { useAnalysisStore } from '../../../stores/useAnalysisStore';
// import { center } from '@turf/turf'; // 引入 center 计算
import { geoService } from '../../../services/geoService';

// 注册模块
// 向 AG Grid 的全局系统注册‘社区版’的所有功能模块，以便表格能正常运行
ModuleRegistry.registerModules([ AllCommunityModule ]);

interface DataPivotProps {
    data: any;          
    fileName: string;   
    // ✅ 新增 fileId，因为导出需要告诉后端是哪个文件
    fileId?: string;
    // ✅ 新增分页 Props
    pagination?: {
        total: number;
        page: number;
        pageSize: number;
    };
    onPageChange?: (page: number, pageSize: number) => void;

    // 接收父组件传来的回调，行点击
    onRowClick?: (record: any) => void;
    // 接收选中的 Feature
    selectedFeature?: any;
    // 数据变更回调 (通知父组件保存)
    onDataChange?: (recordId: string | number, newData: any) => void;
    // 行列操作回调
    onAddRow?: () => void;
    onDeleteRow?: (recordId: string | number) => void;
    onAddColumn?: () => void;
    onDeleteColumn?: (fieldName: string) => void;
}

const DataPivot: React.FC<DataPivotProps> = ({ data, fileName, fileId, pagination, onPageChange, 
    onRowClick, selectedFeature, onDataChange, 
    onAddRow, onDeleteRow, onAddColumn, onDeleteColumn }) => {
    // ✅ 修改 2: 获取上下文感知的 message 实例
    // 注意：MapView 必须被包裹在 <App> 组件中（通常在 main.tsx 或 App.tsx 已经包了）
    const { message } = App.useApp();
    // Grid 引用，用于调用 API
    const gridRef = useRef<AgGridReact>(null);
    // 表格的行数据   
    const [rowData, setRowData] = useState<any[]>([]);
    // 表格列的配置蓝图
    const [columnDefs, setColumnDefs] = useState<ColDef[]>([]);
    // 记录当前选中的行索引，用于删除行
    const [selectedRecordId, setSelectedRecordId] = useState<string | number | null>(null);

    // data 现在直接是数组了，不需要判断 FeatureCollection 
    useEffect(() => {
    if (!data || data.length === 0) {
        setRowData([]);
        setColumnDefs([]);
        return;
    }
    // ✅data 是 features 数组，直接处理
    // 因为App组件中是data={currentData?.features || []}传过来的数组 
    processGeoJSONFeatures(data);

    // 原来的分类处理
    // const ext = fileName.split('.').pop()?.toLowerCase();
    // if (
    //     ext === 'json' || 
    //     ext === 'geojson' || 
    //     ext === 'shp' || 
    //     (data.type === 'FeatureCollection' && Array.isArray(data.features))
    // ) {
    //   processGeoJSON(data);
    // } else {
    //   // 处理普通数组 (CSV/Excel 转换来的)
    //   if (Array.isArray(data)) {
    //     processArrayData(data);
    //   }
    // }

    }, [data, fileName]);

    // 监听 selectedFeature，同步高亮表格行
    useEffect(() => {
    // 先把 API 赋值给局部变量，解决 "gridRef.current is possibly null" 报错
    // 使用可选链 ?. 确保安全访问
    // api 的值是 AG Grid 库在组件初始化完成后，自动挂载到你的 Ref 对象上的
    // api对象里包含了数百个函数，全是用来控制表格的，“万能操作面板”
    const api = gridRef.current?.api;
    // 如果 api 不存在，直接结束
    if (!api) return;

    if (selectedFeature) {
        // 使用局部变量 api 进行操作，TS 就不会报错了
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
        const readOnlyFields = ['id', '_geometry', 'cp', '_cp', '_lng', '_lat', '_geom_coords'];
        const keys = Object.keys(rows[0]);

        // 1. 生成基于数据的真实列
        const baseCols = keys
            .filter(k => !['_cp'].includes(k))
            .map(key => {
                // ✅ 判断当前列是否为那个包含超级长字符串的“几何坐标列”
                const isGeomCoordsCol = (key === '_geom_coords');

                return {
                    field: key,
                    headerName: (() => {
                        if (key === '_geometry') return '图层类型';
                        if (key === 'center') return '中心坐标';
                        if (key === '_lng') return '经度 (Lng)';
                        if (key === '_lat') return '纬度 (Lat)';
                        if (isGeomCoordsCol) return '几何坐标数据 (Geometry)';
                        return key;
                    })(),
                    sortable: true,
                    filter: true,
                    resizable: true,
                    minWidth: 100,

                    // ✅ 新增：如果是几何坐标列，初始宽度设为 200，且最高不超过 300
                    width: isGeomCoordsCol ? 200 : 150,
                    maxWidth: isGeomCoordsCol ? 300 : undefined,
                    // ✅ 新增核心防御：禁止该列参与表格外层的 autoSizeStrategy="fitCellContents"
                    suppressAutoSize: isGeomCoordsCol, 

                    editable: !readOnlyFields.includes(key),
                    cellEditor: 'agTextCellEditor',
                    valueFormatter: (params: any) => {
                        const val = params.value;
                        if (typeof val === 'object' && val !== null) {
                            return JSON.stringify(val); 
                        }
                        return val;
                    }
                };
            });

        // 2. 动态生成 5 列预留空列，专门用于随意输入公式
        const emptyCols = Array.from({ length: 5 }).map((_, i) => ({
            field: `__empty_col_${i}`,
            headerName: ` `,
            editable: true,
            minWidth: 100,
            width: 150,
            cellEditor: 'agTextCellEditor'
        }));

        // 返回合并后的表头
        return [...baseCols, ...emptyCols];
    };

    // ✅把 processGeoJSON 改造一下，只处理 features 数组
    const processGeoJSONFeatures = (features: any[]) => {
        const rows = features.map((feature: any) => {
        

        // let cp = feature.properties?.cp;
        // ✅移除 Turf 计算，直接读取后端算好的 cp
        let cp = feature.properties?.cp
        // cp 解析逻辑
        // 如果 cp 是字符串 (CSV读取时常见)，尝试解析为数组
        if (typeof cp === 'string') {
            try { cp = JSON.parse(cp); } catch(e) {}
        }

        // 如果依然没有有效的 cp 且存在几何数据，使用 Turf.js 计算中心点
        // (需要确保头部引入了: import { center } from '@turf/turf';)
        // if ((!cp || !Array.isArray(cp)) && feature.geometry) {
        //     try {
        //         const c = center(feature);
        //         cp = c.geometry.coordinates;
        //     } catch(e) {}
        // }
        
        // --- 2. 构造基础行数据 ---
        // 将 properties 扁平化，并添加辅助字段
        const row = {
          ...feature.properties, // 扁平化属性
          // 🌟 修复1：强制注入唯一标识符 ID，确保能完美承接后端的回填数据
          id: feature.properties?.id || feature._id || feature.id,
          cp: cp, 
          _geometry: feature.geometry?.type || 'Unknown'
          // ...
        };
        
        // --- 3. 注入导出用的几何字段 (用于 CSV 导出) ---
        if (feature.geometry) {
            const gType = feature.geometry.type;
            const coords = feature.geometry.coordinates;

            if (gType === 'Point' && Array.isArray(coords) && coords.length >= 2) {
                // 如果是点，拆分成 _lng 和 _lat 两列，方便导出后直接查看
                row['_lng'] = coords[0];
                row['_lat'] = coords[1];
            } else {
                // 如果是面/线，把复杂的坐标数组转成字符串保存
                // 这样导出 CSV 时，这一格会包含完整的几何结构数据
                row['_geom_coords'] = JSON.stringify(coords);
            }
        }
        return row;
      });

      setRowData(rows);
      setColumnDefs(generateColumnDefs(rows));
    };

    // 原始的processGeoJSON函数
    // const processGeoJSON = (geoData: any) => {
    //     if (geoData.type === 'FeatureCollection' && Array.isArray(geoData.features)) {
    //       const rows = geoData.features.map((feature: any) => {
    //         let cp = feature.properties.cp;
            
    //         // 如果没有 cp 或 cp 是字符串 ，尝试修复
    //         // JSON.parse 是把 JSON 格式的字符串 转换成 JavaScript 对象或数组
    //         if (typeof cp === 'string') {
    //             try { cp = JSON.parse(cp); } catch(e) {}
    //         }
    //         // 依然没有，则计算
    //         if ((!cp || !Array.isArray(cp)) && feature.geometry) {
    //             try {
    //                 const c = center(feature);
    //                 cp = c.geometry.coordinates;
    //             } catch(e) {}
    //         }
    //         // 准备基础属性
    //         const row = {
    //           ...feature.properties,
    //           cp: cp, 
    //           _geometry: feature.geometry?.type || 'Unknown' 
    //         };

    //         // 注入导出用的几何字段
    //         if (feature.geometry) {
    //             const gType = feature.geometry.type;
    //             const coords = feature.geometry.coordinates;

    //             if (gType === 'Point' && Array.isArray(coords) && coords.length >= 2) {
    //                 // 如果是点，拆分成两列，方便 CSV 导出后直接用
    //                 row['_lng'] = coords[0];
    //                 row['_lat'] = coords[1];
    //             } else {
    //                 // 如果是面/线，把复杂的坐标数组转成字符串
    //                 // 这样导出 CSV 时，这一格会包含完整的几何结构数据
    //                 row['_geom_coords'] = JSON.stringify(coords);
    //             }
    //         }
    //         return row;
    //       });

    //       setRowData(rows);
    //       // 使用提取出来的通用函数
    //       setColumnDefs(generateColumnDefs(rows));
    //     } else {
    //         console.warn('不是标准的 FeatureCollection GeoJSON');
    //     }
    //   };

    /**
     * 导出 CSV 处理函数
     */
    const handleExportCSV = async () => {
        // 安全检查
        if (!fileId) {
            message.error('未找到文件 ID，无法进行服务器端导出');
            return;
        }

        try {
            message.loading({ content: '正在请求服务器生成最新数据...', key: 'exportMsg' });
            
            // 调用 Service 下载
            await geoService.exportFile(fileId, fileName);
            
            message.success({ content: '导出成功，开始下载', key: 'exportMsg' });
        } catch (error) {
            console.error(error);
            message.error({ content: '导出失败', key: 'exportMsg' });
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

        {/* 工具栏 */}
        <div className="bg-[#1f2937] p-2 border-b border-gray-700 flex justify-between items-center">
        <div className="text-xs text-blue-400 font-mono">
            <span>{fileName}</span>
            <span className="ml-2 text-gray-500">({rowData.length} records)</span>
        </div>
        
        {/* 操作按钮组 */}
        <Space size="small">
            {/* 在“增行”左边添加“导出CSV”按钮 */}
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
                    // 不再使用 selectedRowIndex，而是直接获取选中行的数据对象
                    const selectedRows = gridRef.current?.api.getSelectedRows();
                    if (selectedRows && selectedRows.length > 0 && onDeleteRow) {
                        const selectedData = selectedRows[0]; // 获取选中行的完整数据
                        
                        // 确保有 ID
                        if (selectedData.id) {
                            // 传 ID 给父组件，而不是行号
                            onDeleteRow(selectedData.id); 
                            setSelectedRecordId(null); // 重置选中状态
                        } else {
                            message.error('该行数据缺失 ID，无法删除');
                        }
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
                    disabled={selectedRecordId === null}
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
        {/* 注入炫酷的选中样式 */}
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

            /* 自定义选中行的左侧高亮条 */
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

            /* 修复复选框在暗色模式下的可见性 */
            .ag-checkbox-input-wrapper {
                font-size: 14px;
            }
        `}</style>
        
        <AgGridReact

            // 绑定 ref
            ref={gridRef}

            // 解决 Error #239
            // 加上这个属性，允许你继续使用 ag-theme-alpine.css 和你的自定义样式
            theme="legacy" 
            
            rowData={rowData}
            columnDefs={columnDefs}
            
            // 🌟 灵魂属性新增：告诉 AG Grid 如何唯一识别每一行！
            getRowId={(params) => {
                return String(params.data.id);
            }}

            // ✅关闭 AG Grid 的全量分页，因为只给了它一页数据
            pagination={false}
            // paginationPageSize={20}

            animateRows={true}

            // ✅自动调整列宽策略
            // 当表格数据准备好后，自动根据 [表头内容] 和 [单元格内容] 计算最佳宽度
            // 这会让列宽自动撑开，如果总宽度超过容器，AG Grid 会自动出现横向滚动条
            autoSizeStrategy={{
                type: 'fitCellContents' // 适应单元格内容
            }}
            // 明确配置选择模式和复选框
            // checkboxes: true 确保每行前面都有框 (虽然你可能通过其他方式实现了，但这样写最稳)
            // headerCheckbox: false 禁用全选，因为我们做的是单选联动
            rowSelection={{ 
                mode: 'singleRow', 
                checkboxes: true,
            }}
            
            // 无论点击行、复选框还是键盘操作，只要选中变了，这里都会触发
            onSelectionChanged={(event) => {
                // 防死循环：如果选中操作是由 API 触发的（比如点击地图导致表格更新），就不再回传
                if (event.source === 'api') return;

                const selectedRows = event.api.getSelectedRows();
                // 更新本地状态 (为的是控制删行按钮的禁用状态)
                if (selectedRows.length > 0) {
                    setSelectedRecordId(selectedRows[0].id); // 存 ID !
                } else {
                    setSelectedRecordId(null);
                }
                // 通知父组件
                if (onRowClick) {
                    if (selectedRows.length > 0) {
                        onRowClick(selectedRows[0]);
                    } else {
                        // 如果取消选中（点击复选框取消），通知父组件清空
                        onRowClick(null);
                    }
                }
            }}

            // 🌟 修改：升级单元格修改事件，拦截公式输入并触发微服务计算
            onCellValueChanged={async (event) => {
                const { newValue, oldValue, colDef, node, data } = event;
                const field = colDef.field;

                // 如果值没变，不触发任何操作
                if (newValue === oldValue) return;

                // 🌟 新增核心逻辑：检测是否输入了类 Excel 公式 (以 = 开头)
                if (typeof newValue === 'string' && newValue.startsWith('=')) {
                    if (!fileId) {
                        message.error("未找到文件 ID，无法执行公式计算");
                        node.setDataValue(field!, oldValue); // 恢复原值
                        return;
                    }

                    // 正则解析：形如 =ADD_COLS(灾害_1, 灾害_12)
                    const regex = /^=([a-zA-Z0-9_]+)\((.*)\)$/;
                    const match = newValue.match(regex);

                    if (match) {
                        const modelName = match[1];
                        
                        // 🌟 终极防呆解析法：彻底兼容空格、中英文逗号、甚至用户误加的单双引号
                        // 1. 提取用户输入的原始列名（去空格、去引号，可能大小写不对）
                        const rawColumns = match[2]
                            .split(/[,，]/)
                            .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''))
                            .filter((s: string) => s.length > 0);
                        
                        // 🌟 核心修复：获取表格底层真实的字段名字典
                        // event.api.getColumnDefs() 能拿到所有列配置，col.field 就是数据库里原汁原味的真实名字
                        const allRealFields = event.api.getColumnDefs()?.map((col: any) => col.field) || [];

                        // 🌟 智能大小写矫正：不区分大小写地去匹配，然后强制转换为底层的真实名字！
                        const columns = rawColumns.map(inputCol => {
                            const realCol = allRealFields.find(field => 
                                field && field.toLowerCase() === inputCol.toLowerCase()
                            );
                            
                            // 如果连忽略大小写都匹配不上，说明用户真的敲错列名了，直接报错拦截
                            if (!realCol) {
                                throw new Error(`表格中找不到列: "${inputCol}"，请检查拼写`);
                            }
                            return realCol; // 返回矫正后的真实名字 (比如把 CHILDNUM 矫正回 childNum)
                        });

                        console.log("🔥 准备发给后端的真实模型名:", modelName);
                        console.log("🔥 大小写矫正成功！发给后端的精确列名:", columns);

                        // 界面反馈：临时改变当前格子的文字
                        node.setDataValue(field!, "⏳ 计算中...");

                        try {
                            const responseData = await geoService.executeModelFormula(fileId, modelName, columns);
                            const { resultColName, resultData } = responseData;

                            if (!resultData || !Array.isArray(resultData)) {
                                throw new Error("后端返回的数据结构不正确，缺少 resultData 数组！");
                            }

                            // 转换成字典 Map 加速查询
                            const scoreMap = new Map();
                            resultData.forEach((item: any) => {
                                scoreMap.set(String(item.id), item.score);
                            });

                            // 🌟 第一步：更新表头配置 (React 状态)
                            setColumnDefs(prev => {
                                if (prev.some(col => col.field === resultColName)) return prev;
                                return [
                                    ...prev,
                                    { 
                                        field: resultColName, 
                                        headerName: resultColName, 
                                        sortable: true, filter: true, resizable: true, editable: true, minWidth: 100, width: 150 
                                    }
                                ];
                            });

                            // 🌟 第二步：纯 React 状态重绘行数据 (放弃 applyTransaction)
                            // 在 React 18 中，这行代码会和上面的 setColumnDefs 被“自动批处理(Batched)”为同一次渲染
                            // 表头和数据会同时完美地呈现在界面上！
                            setRowData(prev => {
                                return prev.map(row => {
                                    const matchScore = scoreMap.get(String(row.id));
                                    // 如果这行在后端返回的结果里有算好的分数，就把新列和分数塞进这个对象
                                    if (matchScore !== undefined) {
                                        return { ...row, [resultColName]: matchScore };
                                    }
                                    return row;
                                });
                            });

                            node.setDataValue(field!, "✅ 公式完成");
                            message.success(`模型计算成功！新增列 [${resultColName}] 已渲染`);

                        } catch (error: any) {
                            console.error("公式计算失败", error);
                            node.setDataValue(field!, "❌ 公式错误");
                            message.error(error.response?.data?.error || error.response?.data?.details || "计算失败，请检查模型名称和参数列");
                        }
                    } else {
                        node.setDataValue(field!, "❌ 格式错误");
                        message.warning("公式格式错误，请输入形如 =MODEL(col1, col2)");
                    }
                    
                    return; // 🌟 公式处理完毕，直接 return，不要触发下方普通的保存逻辑
                }

                // --- 以下保持你原有的普通数据修改和保存逻辑 ---
                console.log('普通单元格已修改:', event);
                const recordId = data.id;
                if (recordId && onDataChange) {
                    onDataChange(recordId, data);
                }
            }}
        />
        </div> 
        {/* 3. ✅ 新增：底部服务器分页条 */}
        {pagination && (
            <div className="bg-[#111827] border-t border-gray-700 p-2 flex justify-end">
                <Pagination 
                    size="small"
                    current={pagination.page}
                    total={pagination.total}
                    pageSize={pagination.pageSize}
                    onChange={(page, pageSize) => {
                        if (onPageChange) onPageChange(page, pageSize);
                    }}
                    showSizeChanger
                    showTotal={(total) => <span className="text-gray-400">共 {total} 条数据</span>}
                    className="custom-pagination"
                />
                {/* 注入分页条样式适配暗色模式 */}
                <style>{`
                    .custom-pagination .ant-pagination-item a { color: #e5e7eb; }
                    .custom-pagination .ant-pagination-item-active { background: transparent; border-color: #3b82f6; }
                    .custom-pagination .ant-pagination-item-active a { color: #3b82f6; }
                    .custom-pagination .ant-pagination-prev .ant-pagination-item-link,
                    .custom-pagination .ant-pagination-next .ant-pagination-item-link { color: #9ca3af; }
                    .custom-pagination .ant-select-selector { background: #1f2937 !important; color: white !important; border-color: #374151 !important; }
                `}</style>
            </div>
        )}
    </div>
    );
};

export default DataPivot;