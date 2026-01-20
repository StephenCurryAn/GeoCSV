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
import { geoService } from './services/geoService';
import { message } from 'antd';

function App() {
  // 用于存储已上传的文件数据
  const [uploadedFilesData, setUploadedFilesData] = React.useState<Record<string, any>>({});

  // 🚨【新增】当前激活的文件名 (用户正在看哪个文件)
  const [activeFileName, setActiveFileName] = useState<string>('');

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

  return (
    <MainLayout>
      {/* 左侧面板内容 - 资源管理器 */}
      <LeftPanel
        onDataLoaded={handleDataLoaded}
        onSelectFile={handleSelectFile}
      />

      {/* 中间面板内容 - 数据透视表 */}
      {/* 🚨【修改】使用 DataPivot 组件 */}
      <div className="h-full w-full bg-[#111827] flex flex-col overflow-hidden">
        {/* 传参：
            data: 根据 activeFileName 从缓存里取数据 
            fileName: 当前文件名 (用于 DataPivot 内部判断后缀)
        */}
        <DataPivot 
            data={uploadedFilesData[activeFileName]} 
            fileName={activeFileName} 
        />
      </div>

      {/* 右侧面板内容 - 地图可视化 */}
      {/* 建议：也改成 h-full w-full flex flex-col，去掉 padding，让地图铺满 */}
      <div className="h-full w-full flex flex-col bg-gray-900 border-l border-gray-800 relative">
        {/* 这里以后放 MapView 组件 */}
        <div className="flex-1 flex items-center justify-center text-gray-500">
           <div className="text-center">
            <p className="mb-2">🌍 地图容器</p>
            <p className="text-xs">MapLibre GL JS 将在此渲染</p>
            {/* 显示当前激活的图层名，方便调试 */}
            {activeFileName && <p className="text-xs text-blue-500 mt-2">当前图层: {activeFileName}</p>}
           </div>
        </div>
      </div>
    </MainLayout>
  )
}

export default App;