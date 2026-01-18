// client/src/features/workspace/components/LeftPanel.tsx
import React, { useState } from 'react';
import { Segmented } from 'antd';
import { AppstoreOutlined, ToolOutlined } from '@ant-design/icons';
import FileTree from './FileTree';

// 定义接口，接收从 App.tsx 传下来的回调
interface LeftPanelProps {
  onDataLoaded: (fileName: string, data: any) => void;
  onSelectFile?: (fileName: string) => void;
}

const LeftPanel: React.FC<LeftPanelProps> = ({ onDataLoaded, onSelectFile }) => {
  // 控制显示哪个组件
  const [activeTab, setActiveTab] = useState<string>('workspace');

  return (
    <div className="flex flex-col h-full bg-[#111827] text-white">
      
      {/* 1. 顶部 Tab 切换 (始终显示) */}
      <div className="p-3 border-b border-gray-800">
        <Segmented
          block
          value={activeTab}
          onChange={(val) => setActiveTab(val as string)}
          options={[
            { 
              label: '工作空间', 
              value: 'workspace', 
              icon: <AppstoreOutlined /> 
            },
            { 
              label: '分析工具', 
              value: 'analysis', 
              icon: <ToolOutlined /> 
            },
          ]}
          className="bg-gray-800 text-gray-400 custom-segmented"
        />
        {/* CSS 穿透：强制修改 Segmented 样式适配深色模式 */}
        <style>{`
          .custom-segmented .ant-segmented-item-selected {
            background-color: #1677ff !important;
            color: white !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.4);
          }
          .custom-segmented .ant-segmented-item:hover:not(.ant-segmented-item-selected) {
            background-color: rgba(255,255,255,0.08) !important;
            color: white !important;
          }
          .custom-segmented .ant-segmented-item {
             color: #9ca3af; /* text-gray-400 */
          }
        `}</style>
      </div>

      {/* 2. 内容区域 (根据 Tab 切换) */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'workspace' ? (
          // A. 显示文件树组件 (包含上传、新建、列表)
          <FileTree 
            onDataLoaded={onDataLoaded}
            onSelectFile={onSelectFile}
          />
        ) : (
          // B. 显示分析工具组件 (占位)
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
            <div className="p-4 bg-gray-800 rounded-full mb-3 opacity-50">
              <ToolOutlined className="text-3xl text-blue-400"/>
            </div>
            <p>分析工具箱开发中...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeftPanel;