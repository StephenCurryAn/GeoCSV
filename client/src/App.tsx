// // App.tsx 进阶版写法
// import MainLayout from './layouts/MainLayout';
// import ResourceManager from './components/ResourceManager'; // 假设你以后创建了这个
// import DataPivot from './components/DataPivot';             // 假设你以后创建了这个
// import MapView from './components/MapView';                 // 假设你以后创建了这个

// function App() {
//   return (
//     <MainLayout>
//       <ResourceManager /> {/* 第1个：左侧 */}
//       <DataPivot />       {/* 第2个：中间 */}
//       <MapView />         {/* 第3个：右侧 */}
//     </MainLayout>
//   )
// }

import React, { useState } from 'react';
import './App.css';
import MainLayout from './layouts/MainLayout';
import LeftPanel from './features/workspace/components/LeftPanel';
import DataPivot from './features/table/components/DataPivot';
import MapView from './features/map/components/MapView';
import { geoService } from './services/geoService';
import { message, Modal } from 'antd';

function App() {
  // 🚨【新增】保存当前文件的 ID，用于后续发请求
  const [activeFileId, setActiveFileId] = useState<string>('');

  // 用于存储已上传的文件数据
  const [uploadedFilesData, setUploadedFilesData] = React.useState<Record<string, any>>({});

  // 🚨【新增】当前激活的文件名 (用户正在看哪个文件)
  const [activeFileName, setActiveFileName] = useState<string>('');
  // 🚨【新增】当前选中的要素属性（从表格点出来的）
  const [selectedFeature, setSelectedFeature] = useState<any>(null);

  // 回调函数，后面根据需要再写相关的功能，传给表格，地图组件等之类的
  // 处理数据加载的回调函数
  const handleDataLoaded = (fileName: string, data: any) => {
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
  };

  // 处理文件选择
  const handleSelectFile = async (fileName: string, fileId?: string) => {
    console.log(`选择了文件: ${fileName}`);

    // 1. 设置当前激活的文件名
    setActiveFileName(fileName);
    // 🚨【关键新增】如果有 fileId，保存下来！
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
    // 🚨【修复点】先检查 fileId 是否存在
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

  /**
   * 🚨【核心新增】处理表格数据修改
   * @param rowIndex 修改的行索引
   * @param newRowData 修改后的这一行数据
   */
  const handleDataChange = async (rowIndex: number, newRowData: any) => {
    if (!activeFileName) return;

    console.log(`正在更新第 ${rowIndex} 行数据...`, newRowData);

    // 1. 更新本地 React 状态 (实现 UI 的即时响应，地图属性会同步更新)
    setUploadedFilesData(prev => {
        const currentData = prev[activeFileName];
        let updatedData = { ...currentData }; // 浅拷贝

        // 判断数据类型并更新
        if (currentData.type === 'FeatureCollection' && Array.isArray(currentData.features)) {
            // GeoJSON: 更新 features 数组里的 properties
            // 注意：DataPivot 里的 newRowData 是扁平化的，我们需要把 properties 覆盖回去
            // 且不能覆盖 geometry
            const oldFeature = currentData.features[rowIndex];
            
            // 构造新的 Feature
            const newFeature = {
                ...oldFeature,
                properties: {
                    ...oldFeature.properties,
                    ...newRowData // 覆盖修改的字段 (name, pop 等)
                }
            };
            
            // 剔除掉 DataPivot 临时加的 _geometry, _cp 等字段 (如果有的话)
            delete newFeature.properties._geometry;
            delete newFeature.properties.cp; 

            // 更新数组
            updatedData.features = [...currentData.features];
            updatedData.features[rowIndex] = newFeature;

        } else if (Array.isArray(currentData)) {
            // 普通数组: 直接替换
            updatedData = [...currentData];
            updatedData[rowIndex] = newRowData;
        }

        return {
            ...prev,
            [activeFileName]: updatedData
        };
    });

    // 2. 发送请求给后端保存 (真实调用)
    try {
        message.loading({ content: '正在保存修改...', key: 'save' });
        
        // 🚨 真实调用：调用 Service 层发送请求
        // 注意：这里需要你在 geoService.ts 里实现 updateFileData 方法
        const response = await geoService.updateFileData(activeFileId, rowIndex, newRowData);
        
        if (response.code === 200) {
            message.success({ content: '保存成功', key: 'save' });
            console.log('✅ 后端数据已更新:', response);
        } else {
            throw new Error(response.message || '后端返回错误');
        }

    } catch (error) {
        console.error('保存失败', error);
        message.error({ content: '保存失败，请检查网络', key: 'save' });
        
        // 🚨 进阶：如果失败了，最好在这里回滚 setUploadedFilesData 的状态
        // (为了简单起见，这里暂略，但实际项目中建议加上回滚逻辑)
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
  const handleDeleteRow = async (rowIndex: number) => {
    if (!activeFileId) return;
    try {
        message.loading({ content: '正在删除行...', key: 'row-op' });
        await geoService.deleteRow(activeFileId, rowIndex);
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
    Modal.confirm({
        title: '新增列',
        content: (
            <input 
                className="border p-1 w-full text-black" 
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

  // 辅助函数：重新加载数据 (复用 handleSelectFile 的逻辑，但简化版)
  const refreshFileData = async (fileId: string, fileName: string) => {
      const res = await geoService.getFileContent(fileId);
      if (res.code === 200) {
          setUploadedFilesData(prev => ({ ...prev, [fileName]: res.data }));
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
          // 🚨【新增】当表格行被点击时，更新 App 的状态
          onRowClick={(record) => setSelectedFeature(record)}
          selectedFeature={selectedFeature}
          // 🚨 传入修改回调
          onDataChange={handleDataChange}

          // 🚨 传入新方法
          onAddRow={handleAddRow}
          onDeleteRow={handleDeleteRow}
          onAddColumn={handleAddColumn}
          onDeleteColumn={handleDeleteColumn}
      />

      {/* 第 3 个子元素：右侧 (直接放组件) */}
      <MapView 
          data={uploadedFilesData[activeFileName]} 
          fileName={activeFileName}
          // 🚨【新增】传入选中的要素，用于高亮和弹窗
          selectedFeature={selectedFeature}
          onFeatureClick={(feature) => setSelectedFeature(feature)}
      />
    </MainLayout>
  )
}

export default App;