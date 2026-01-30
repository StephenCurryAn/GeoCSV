import React, { useState } from 'react';
import './App.css';
import MainLayout from './layouts/MainLayout';
import LeftPanel from './features/workspace/components/LeftPanel';
import DataPivot from './features/table/components/DataPivot';
import MapView from './features/map/components/MapView';
import { geoService } from './services/geoService';
// import { message, Modal } from 'antd';
import { App as AntdApp } from 'antd'; // 1. 引入 App 组件 (重命名为 AntdApp 避免冲突)

function App() {
    // 核心修改：使用 useApp Hook 获取带上下文的实例
    // 这样弹出的 message 和 modal 就会跟随全局主题（变黑），且不会报错
    const { message, modal } = AntdApp.useApp();

    // 用于存储已上传的文件数据
    const [uploadedFilesData, setUploadedFilesData] = React.useState<Record<string, any>>({});

    // 保存当前文件的 ID，用于后续发请求
    const [activeFileId, setActiveFileId] = useState<string>('');
    
    // 当前激活的文件名 (用户正在看哪个文件)
    const [activeFileName, setActiveFileName] = useState<string>('');

    // 当前选中的要素属性（从表格点出来的）
    const [selectedFeature, setSelectedFeature] = useState<any>(null);

    /**
    * 一些辅助函数
    */
    // 重新加载数据 (复用 handleSelectFile 的逻辑，但简化版)
    const refreshFileData = async (fileId: string, fileName: string) => {
        const res = await geoService.getFileContent(fileId);
        if (res.code === 200) {
            setUploadedFilesData(prev => ({ ...prev, [fileName]: res.data }));
        }
    };

    /**
    * 一些回调函数，传给子组件
    * 
    * 在 React 中，数据是单向流动的（从父到子）。
    * 父组件 (App)：持有数据（State）。
    * 子组件 (DataPivot, LeftPanel)：只负责显示，没有权利直接修改父组件的数据。
    * 那子组件想修改数据怎么办？ 父组件会写好一个函数（比如 handleDataChange），
    * 然后像传递数据一样，把这个函数传给子组件。
    * 当子组件发生操作（比如用户填了表），子组件就“打电话”给父组件（调用这个函数），让父组件自己去改。
    * 这个“打电话”的过程，就是 Call Back（回调）。
    */

    // 回调函数，后面根据需要再写相关的功能，传给表格，地图组件等之类的
    // 处理数据加载
    const handleDataLoaded = (fileName: string, data: any, fileId: string) => {
        console.log(`文件 ${fileName} 加载成功`, data);
        // 存储上传的文件数据
        setUploadedFilesData(prev => ({
            ...prev,
            [fileName]: data
        }));
        // 这里可以更新地图和表格的数据
        // 例如：setGridData(data.features || data.rows);
        // 例如：setMapData(data);

        // 上传成功后，自动选中该文件
        setActiveFileName(fileName);
        // 这里面的fileId来源是后端数据库 (MongoDB) 在执行 fileNode.save() 时候
        // 就在这一刻，MongoDB 自动为这条数据生成了一个唯一的 _id（类似于 65a1b2c... 这种字符串）
        // 后端在保存成功后，会将这个 _id 包装在响应数据中发回给前端
        setActiveFileId(fileId);
    };

    // 处理文件选择
    const handleSelectFile = async (fileName: string, fileId?: string) => {
        console.log(`选择了文件: ${fileName}`);

        // 1. 设置当前激活的文件名
        setActiveFileName(fileName);
        // 如果有 fileId，保存下来！
        if (fileId) {
            setActiveFileId(fileId);
        }
        setSelectedFeature(null); // 切换文件时，清空选中的要素
        // 检查是否是已上传的文件
        if (uploadedFilesData[fileName]) {
            // 如果是已上传的文件，使用之前上传的数据
            console.log(`使用已上传的 ${fileName} 数据`, uploadedFilesData[fileName]);
            // 这里可以更新地图和表格的数据
            // 例如：setGridData(uploadedFilesData[fileName].features || uploadedFilesData[fileName].rows);
            // 例如：setMapData(uploadedFilesData[fileName]);
            return;
        }
        // 2. 内存里没有，说明是刷新过，或者新登录的
        // 这时候不应该报错，而是应该去后端“捞”数据
        // 先检查 fileId 是否存在
        if (!fileId) {
            console.warn(`文件 ${fileName} 没有 ID，无法从后端获取内容`);
            return; // 如果没有 ID，直接结束，不再调用 getFileContent
        }
        try {
            message.loading('正在加载数据...', 1);
            // 假设你已经在 geoService 里写好了 getFileContent 方法
            const res = await geoService.getFileContent(fileId); 
            
            if (res.code === 200) {
                // 3. 捞回来了！存入内存，下次就不用捞了
                setUploadedFilesData(prev => ({
                    ...prev,
                    [fileName]: res.data
                }));
                
                // 4. 渲染地图
                console.log('数据加载完成，开始渲染');
            }
        } catch (err) {
            console.error('无法加载文件数据');
        }
    };

    // 处理表格数据修改
    const handleDataChange = async (recordId: string | number, newRowData: any) => {
        if (!activeFileName) return;
        // 备份原始数据 (用于失败回滚)
        // 注意：这里直接读取当前的 uploadedFilesData 状态
        const currentFileData = uploadedFilesData[activeFileName]; 
        let originalRecord: any = null;
        if (currentFileData) {
            // 根据数据类型找到当前这一行/要素的原始值
            if (currentFileData.type === 'FeatureCollection' && Array.isArray(currentFileData.features)) {
                // GeoJSON: 查找对应的 Feature
                const target = currentFileData.features.find((f: any) => 
                    f.properties?.id == recordId || f.id == recordId
                );
                // 深拷贝备份，防止引用被后续的 setUploadedFilesData 修改
                if (target) originalRecord = JSON.parse(JSON.stringify(target));
            } else if (Array.isArray(currentFileData)) {
                // 普通数组: 查找对应的 Row
                const target = currentFileData.find((row: any) => row.id == recordId);
                // 浅拷贝备份即可 (假设对象只有一层)
                if (target) originalRecord = JSON.parse(JSON.stringify(target));
            }
        }

        console.log(`正在更新记录 ${recordId} 数据...`, newRowData);
        // 1. 更新本地 React 状态 (实现 UI 的即时响应，地图属性会同步更新)
        setUploadedFilesData(prev => {
            const currentData = prev[activeFileName];
            if (!currentData) return prev; // 安全检查
            let updatedData = { ...currentData }; // 浅拷贝

            // 判断数据类型并更新
            if (currentData.type === 'FeatureCollection' && Array.isArray(currentData.features)) {
                // GeoJSON: 更新 features 数组里的 properties
                // 注意：DataPivot 里的 newRowData 是扁平化的，我们需要把 properties 覆盖回去
                // 且不能覆盖 geometry，假设你的 ID 存在 properties.id 中 (根据之前的 csv 解析逻辑)
                const targetIndex = currentData.features.findIndex((f: any) => 
                    f.properties?.id == recordId || f.id == recordId
                );
                if (targetIndex === -1) {
                    console.warn(`未找到记录 ${recordId}`);
                    return prev; // 未找到记录，不做任何更新
                }
                const oldFeature = currentData.features[targetIndex];
                
                // 构造新的 Feature
                const newFeature = {
                    ...oldFeature,
                    properties: {
                        ...oldFeature.properties,
                        ...newRowData // 覆盖修改的字段 (name, pop 等)，相同的键名，后面的会覆盖前面的
                    }
                };
                
                // 剔除掉 DataPivot 临时加的 _geometry, _cp 等字段 (如果有的话)
                delete newFeature.properties._geometry;
                delete newFeature.properties.cp; 

                // 更新数组
                updatedData.features = [...currentData.features];
                updatedData.features[targetIndex] = newFeature;

            } else if (Array.isArray(currentData)) {
                const targetIndex = currentData.findIndex((row: any) => row.id == recordId);
                if (targetIndex === -1) {
                    console.warn(`未找到记录 ${recordId}`);
                    return prev; // 未找到记录，不做任何更新
                }

                // 普通数组: 直接替换
                updatedData = [...currentData];
                updatedData[targetIndex] = { ...updatedData[targetIndex], ...newRowData };
            }

            return {
                ...prev,
                [activeFileName]: updatedData
            };
        });

        // 2. 发送请求给后端保存 (真实调用，硬盘中保存)
        try {
            message.loading({ content: '正在保存修改...', key: 'save' });
            
            // 真实调用：调用 Service 层发送请求
            // 注意：这里需要你在 geoService.ts 里实现 updateFileData 方法
            const response = await geoService.updateFileData(activeFileId, recordId, newRowData);
            
            if (response.code === 200) {
                message.success({ content: '保存成功', key: 'save' });
                console.log('后端数据已更新:', response);
            } else {
                throw new Error(response.message || '后端返回错误');
            }

        } catch (error) {
            console.error('保存失败', error);
            message.error({ content: '保存失败，已自动还原修改', key: 'save' });
        
            // 失败回滚逻辑 
            if (originalRecord) {
                setUploadedFilesData(prev => {
                    const currentData = prev[activeFileName];
                    if (!currentData) return prev; // 安全检查

                    // 这里的逻辑很简单：直接把备份的 originalRecord 塞回去
                    let updatedData: any;

                    if (currentData.type === 'FeatureCollection' && Array.isArray(currentData.features)) {
                        updatedData = { ...currentData };
                        const targetIndex = updatedData.features.findIndex((f: any) => 
                            f.properties?.id == recordId || f.id == recordId
                        );
                        if (targetIndex !== -1) {
                            updatedData.features = [...currentData.features];
                            // 直接用备份覆盖，不仅仅是合并属性，而是完全恢复
                            updatedData.features[targetIndex] = originalRecord;
                        }
                    } else if (Array.isArray(currentData)) {
                        updatedData = [...currentData];
                        const targetIndex = updatedData.findIndex((row: any) => row.id == recordId);
                        if (targetIndex !== -1) {
                            // 直接用备份覆盖
                            updatedData[targetIndex] = originalRecord;
                        }
                    } else {
                        return prev;
                    }

                    return {
                        ...prev,
                        [activeFileName]: updatedData
                    };
                });
            }
        }
    };

    // 1. 新增行处理
    const handleAddRow = async () => {
        if (!activeFileId) return;
        try {
            message.loading({ content: '正在添加行...', key: 'row-op' });
            // 这里的 res.data 通常是更新后的整个 features 数组或者新数据
            // 为了简单，我们直接重新加载一次整个文件，或者后端返回整个新数据
            await geoService.addRow(activeFileId);
            
            message.success({ content: '新增成功', key: 'row-op' });
            // 重新拉取最新数据刷新界面
            refreshFileData(activeFileId, activeFileName);
        } catch (e: any) {
            message.error({ content: e.message, key: 'row-op' });
        }
    };

    // 2. 删除行处理
    const handleDeleteRow = async (recordID: string | number) => {
        if (!activeFileId) return;
        try {
            message.loading({ content: '正在删除行...', key: 'row-op' });
            await geoService.deleteRow(activeFileId, recordID);
            message.success({ content: '删除成功', key: 'row-op' });
            refreshFileData(activeFileId, activeFileName);
        } catch (e: any) {
            message.error({ content: e.message, key: 'row-op' });
        }
    };

    // 3. 新增列处理
    const handleAddColumn = () => {
        if (!activeFileId) return;
        // 使用 Antd Modal 获取输入
        let value = '';
        modal.confirm({
            title: '新增列',
            content: (
                <input 
                    className="border p-1 w-full text-blue-100" 
                    placeholder="请输入新列名 (英文)" 
                    onChange={(e) => value = e.target.value} 
                />
            ),
            onOk: async () => {
                if (!value) return message.warning('列名不能为空');
                try {
                    message.loading({ content: '正在添加列...', key: 'col-op' });
                    await geoService.addColumn(activeFileId, value);
                    message.success({ content: '添加成功', key: 'col-op' });
                    refreshFileData(activeFileId, activeFileName);
                } catch (e: any) {
                    message.error({ content: e.message, key: 'col-op' });
                }
            }
        });
    };

    // 4. 删除列处理
    const handleDeleteColumn = async (fieldName: string) => {
        if (!activeFileId) return;
        try {
            message.loading({ content: '正在删除列...', key: 'col-op' });
            await geoService.deleteColumn(activeFileId, fieldName);
            message.success({ content: '删除成功', key: 'col-op' });
            refreshFileData(activeFileId, activeFileName);
        } catch (e: any) {
            message.error({ content: e.message, key: 'col-op' });
        }
    };



  return (
    <MainLayout>
      {/* 第 1 个子元素：左侧 */}
      <LeftPanel
        onDataLoaded={handleDataLoaded}
        onSelectFile={handleSelectFile}
      />

      {/* 第 2 个子元素：中间 (直接放组件，不需要再包 div 了) */}
      <DataPivot 
          data={uploadedFilesData[activeFileName]} 
          fileName={activeFileName} 
          // 当表格行被点击时，更新 App 的状态
          onRowClick={(record) => setSelectedFeature(record)}
          selectedFeature={selectedFeature}
          // 传入修改回调
          onDataChange={handleDataChange}
          // 传入新方法
          onAddRow={handleAddRow}
          onDeleteRow={handleDeleteRow}
          onAddColumn={handleAddColumn}
          onDeleteColumn={handleDeleteColumn}
      />

      {/* 第 3 个子元素：右侧 (直接放组件) */}
      <MapView 
          data={uploadedFilesData[activeFileName]} 
          fileName={activeFileName}
          // 传入选中的要素，用于高亮和弹窗
          selectedFeature={selectedFeature}
          onFeatureClick={(feature) => setSelectedFeature(feature)}
      />
    </MainLayout>
  )
}

export default App;