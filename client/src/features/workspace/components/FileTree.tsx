import React, { useState } from 'react';
import { Tree, Upload, message, Empty } from 'antd'; // 引入 Empty 组件美化空状态
import { InboxOutlined, FileTextOutlined, FileImageOutlined, TableOutlined } from '@ant-design/icons';
import { geoService, type UploadResponse } from '../../../services/geoService';

// 定义树节点的数据结构
interface TreeNode {
  key: string;
  title: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
  isLeaf?: boolean;
  rawFileName?: string; // 新增：保存原始文件名，方便查找对比
}

interface FileTreeProps {
  onDataLoaded: (fileName: string, data: any) => void;
}

const FileTree: React.FC<FileTreeProps> = ({ onDataLoaded }) => {
  // 状态管理
  const [treeData, setTreeData] = useState<TreeNode[]>([
    {
      key: 'root',
      title: '📁 项目根目录',
      children: [],
      isLeaf: false,
    }
  ]);

  // 辅助函数：根据文件名获取图标 (移动到上面，方便调用)
  const getFileIcon = (fileName: string): React.ReactNode => {
    const extension = fileName.toLowerCase().split('.').pop();
    switch (extension) {
      case 'csv':
      case 'xlsx':
      case 'xls':
        return <TableOutlined className="text-green-400" />; // 给 Excel/CSV 绿色图标
      case 'geojson':
      case 'json':
        return <FileImageOutlined className="text-yellow-400" />; // 给 GeoJSON 黄色图标
      default:
        return <FileTextOutlined className="text-gray-300" />;
    }
  };

  /**
   * 自定义上传请求
   */
  const customUploadRequest = async (options: any) => {
    const { file, onSuccess, onError } = options;
    const targetFile = file as File; // 类型断言

    try {
      const response: UploadResponse = await geoService.uploadGeoData(targetFile);

      if (response.code === 200 && response.data) {
        // 1. AntD 上传状态设为完成
        onSuccess && onSuccess(response);

        // 2. 回调父组件
        onDataLoaded(response.data.fileName, response.data.geoJson);

        // 3. 准备新节点对象
        const newFileNode: TreeNode = {
          key: `${Date.now()}`, // key 保持唯一
          title: response.data.fileName, // 直接使用文件名，不加 emoji，由 icon 属性控制
          rawFileName: response.data.fileName,
          isLeaf: true,
          icon: getFileIcon(response.data.fileName), // ✅ 修复：调用图标函数
        };

        // 4. 更新树数据 (Immutable update)
        setTreeData(prev => {
          // 找到根节点在数组中的索引
          const rootIndex = prev.findIndex(node => node.key === 'root');
          if (rootIndex === -1) return prev;

          // 浅拷贝整个数组
          const newTreeData = [...prev];
          
          // 浅拷贝根节点对象 (为了不修改原对象)
          const rootNode = { ...newTreeData[rootIndex] };
          
          // 浅拷贝 children 数组 (如果 undefined 则初始化为空)
          const children = rootNode.children ? [...rootNode.children] : [];

          // 查重逻辑：精确匹配
          const existingIndex = children.findIndex(
            child => child.rawFileName === response.data?.fileName
          );

          if (existingIndex !== -1) {
            // 如果存在，替换它
            children[existingIndex] = newFileNode;
          } else {
            // 如果不存在，追加它
            children.push(newFileNode);
          }

          // 将新的 children 赋值回根节点副本
          rootNode.children = children;
          
          // 将新的根节点放回数组
          newTreeData[rootIndex] = rootNode;

          return newTreeData;
        });

        message.success(`${targetFile.name} 上传成功！`);
      } else {
        throw new Error(response.message || '上传未返回有效数据');
      }
    } catch (error: any) {
      onError && onError(error);
      message.error(`上传失败: ${error.message}`);
      console.error(error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-geo-panel p-4 rounded-lg shadow-lg">
      {/* Tailwind v4 注意：
         AntD Tree 的文字颜色很难改，这里我们用一个特殊的 class 
         或者直接内联样式覆盖，确保深色模式下文字可见 
      */}
      <style>{`
        .ant-tree .ant-tree-node-content-wrapper {
          color: rgba(255, 255, 255, 0.85); 
        }
        .ant-tree .ant-tree-node-content-wrapper:hover {
          background-color: rgba(255, 255, 255, 0.1) !important;
        }
        .ant-tree-treenode-selected .ant-tree-node-content-wrapper {
          background-color: rgba(24, 144, 255, 0.3) !important;
        }
      `}</style>

      {/* 上传区域 */}
      <div className="mb-6">
        <Upload.Dragger
          name="file"
          multiple={false}
          customRequest={customUploadRequest}
          showUploadList={false}
          accept=".csv,.geojson,.json,.xlsx,.xls,.shp,.zip"
          className="geo-upload-dragger" // 可以去 css 文件里细调边框颜色
          style={{ 
            backgroundColor: 'var(--color-geo-dark)', 
            borderColor: 'var(--color-geo-border)' 
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: '#1890ff', fontSize: '24px' }} />
          </p>
          <p className="text-gray-300 text-sm mt-2">点击或拖拽文件上传</p>
        </Upload.Dragger>
      </div>

      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <span className="text-blue-400">▍</span> 资源管理器
        </h3>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
          {treeData[0]?.children?.length || 0}
        </span>
      </div>

      {/* 树形列表区域 */}
      <div className="grow overflow-y-auto min-h-0">
        {(!treeData[0].children || treeData[0].children.length === 0) ? (
          <div className="h-32 flex flex-col items-center justify-center text-gray-500 opacity-60">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件" />
          </div>
        ) : (
          <Tree
            className="bg-transparent"
            showIcon={true}
            defaultExpandAll={true}
            treeData={treeData}
            blockNode // 让节点占满整行，方便点击
            switcherIcon={({ expanded }) => (
               <span className="text-gray-500 text-xs">
                 {expanded ? '▼' : '▶'}
               </span>
            )}
          />
        )}
      </div>
    </div>
  );
};

export default FileTree;