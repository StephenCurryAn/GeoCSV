import React, { useState } from 'react';
import { Tree, Upload, Button, message, Empty } from 'antd'; // 引入 Empty 组件美化空状态
import { FolderAddOutlined, CloudUploadOutlined, FileTextOutlined, FileImageOutlined, TableOutlined, FolderFilled, CheckOutlined} from '@ant-design/icons';
import { geoService, type UploadResponse } from '../../../services/geoService';

// 定义树节点的数据结构
// “？”是可选的意思
// React.ReactNode 是 React 里表示“任何可以渲染的内容”的类型
export interface TreeNode {
  key: string;
  title: string;
  type : 'file' | 'folder';
  icon?: React.ReactNode;
  children?: TreeNode[];
  isLeaf?: boolean;
  rawFileName?: string; // 保存原始文件名，方便查找对比
}

// 实现子组件传导数据到父组件的接口
export interface FileTreeProps {
  onDataLoaded: (fileName: string, data: any) => void;
  onSelectFile?: (fileName: string) => void;
}

// 创建文件树组件，并将FileTreeProps作为属性类型（制定规则）
// onDataLoaded是一个回调函数，类型是(FileName: string, data: any) => void (对象解构，可以直接用onDataLoaded变量名)
const FileTree: React.FC<FileTreeProps> = ({ onDataLoaded, onSelectFile }) => {
  
  // 状态管理
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  // TreeNode[]表示 TreeNode 类型的数组
  const [treeData, setTreeData] = useState<TreeNode[]>([
    {
      key: 'root',
      title: '项目根目录',
      type: 'folder',
      children: [
        {
          key: 'folder1',
          title: '示例文件夹',
          type: 'folder',
          children: [
            {
              key: 'sample2',
              title: '示例数据.geojson',
              type: 'file',
              isLeaf: true,
              rawFileName: '示例数据.geojson',
            }
          ],
          isLeaf: false,
        }
      ],
      isLeaf: false,
    },
    {
      key: 'sample1',
      title: '示例数据.csv',
      type: 'file',
      isLeaf: true,
      rawFileName: '示例数据.csv',
    }
  ]
);

  // 辅助函数：根据文件名获取图标
  // 图标逻辑：根据文件类型返回不同颜色图标
  const getIcon = (props: any) => {
    if (props.type === 'folder') {
      return <FolderFilled className="text-yellow-500 text-lg" />;
    }
    const ext = (props.title || '').toLowerCase().split('.').pop();
    switch (ext) {
      case 'csv': return <TableOutlined className="text-green-400 " />;
      case 'xlsx': return <TableOutlined className="text-green-400" />;
      case 'json': return <FileImageOutlined className="text-yellow-400" />;
      case 'geojson': return <FileImageOutlined className="text-yellow-400" />;
      default: return <FileTextOutlined className="text-gray-400" />;
    }
  };
  // 标题渲染逻辑：实现"右侧对勾"效果
  const titleRender = (node: any) => {
    const isSelected = selectedKeys.includes(node.key);
    return (
      <div className="flex items-center justify-between w-full pr-2 group">
        <span className="text-gray-600 group-hover:text-black transition-colors">
          {node.title}
        </span>
        {isSelected && <CheckOutlined className="text-blue-400 text-xs" />}
      </div>
    );
  };


  /**
   * 自定义上传请求
   */
  const customUploadRequest = async (options: any) => {
    // 解构赋值，得到需要的参数
    const { file, onSuccess, onError } = options;
    //// 0表示持续显示加载中，不要关闭
    // const hide = message.loading('解析中...', 0);
    // 类型断言，告诉 TypeScrip "AntD 传进来的 file 是 File 类型"
    const targetFile = file as File; // 类型断言，告诉 TypeScript 这个 file 是浏览器的 File 对象

    try {
      const response: UploadResponse = await geoService.uploadGeoData(targetFile);
      // hide();

      if (response.code === 200 && response.data) {
        // 1. AntD 上传状态设为完成
        // &&是逻辑与，意思是“如果前面成立，就执行后面”
        onSuccess && onSuccess(response);

        // 2. 回调父组件（通知父组件 (App) 去画地图，，，）
        onDataLoaded(response.data.fileName, response.data.geoJson);

        // 3. 准备新节点对象（更新）
        const newFileNode: TreeNode = {
          key: `${Date.now()}`, // key 保持唯一
          title: response.data.fileName, // 直接使用文件名，不加 emoji，由 icon 属性控制
          type: 'file',
          rawFileName: response.data.fileName,
          isLeaf: true,
          icon: getIcon(response.data.fileName),
        };

        // 4. 更新树数据 (Immutable update)
        setTreeData(prev => {
          // // 找到根节点在数组中的索引
          // const rootIndex = prev.findIndex(node => node.key === 'root');
          // // findIndex 找到了就是 0（或其他数字），找不到就是 -1。
          // if (rootIndex === -1) return prev;

          // 浅拷贝整个数组
          // 如果运行“prev === newTreeData”，结果是 false，说明我们创建了一个新数组
          // ... 展开的时候，严格保留了所有元素原本的顺序（索引位置）
          // const newTreeData = [...prev];
          const newData = [...prev];
          if (newData.length > 0 && newData[0].type === 'folder') {
             if (!newData[0].children) newData[0].children = [];
             newData[0].children.push(newFileNode);
          } else {
             newData.push(newFileNode);
          }
          return newData;

          // // 浅拷贝根节点对象 (为了不修改原对象)
          // const rootNode = { ...newTreeData[rootIndex] };
          
          // // 浅拷贝 children 数组 (如果 undefined 则初始化为空)
          // const children = rootNode.children ? [...rootNode.children] : [];

          // // 查重逻辑：精确匹配
          // const existingIndex = children.findIndex(
          //   // child => child.rawFileName是箭头函数，表示对每个child进行判断 
          //   // 其中第一个child是children数组里的每个元素（相当于箭头函数的参数定义）
          //   child => child.rawFileName === response.data?.fileName
          // );

          // if (existingIndex !== -1) {
          //   // 如果存在，替换它
          //   children[existingIndex] = newFileNode;
          // } else {
          //   // 如果不存在，追加它
          //   children.push(newFileNode);
          // }

          // // 将新的 children 赋值回根节点副本
          // rootNode.children = children;
          
          // // 将新的根节点放回数组
          // newTreeData[rootIndex] = rootNode;

          // return newTreeData;
        });

        message.success(`${targetFile.name} 上传成功！`);
        // 选中新上传的文件
        setSelectedKeys([newFileNode.key]);
      } else {
        throw new Error(response.message || '上传未返回有效数据');
      }
    } catch (error: any) {
      onError && onError(error);
      message.error(`上传失败: ${error.message}`);
      console.error(error);
    }
  };

  // 选中逻辑
  const handleSelect = (keys: React.Key[], info: any) => {
    const key = keys[0] as string;
    if (!key) return;
    
    setSelectedKeys([key]);
    if (info.node.type === 'file' && onSelectFile) {
      onSelectFile(info.node.rawFileName);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#111827]">
      {/* 1. 工具栏区域 (Toolbar)
         这里放"新建文件夹"和"上传"按钮
      */}
      <div className="px-3 py-3 flex items-center justify-between border-b border-gray-800">
        <span className="font-bold text-gray-200 text-sm">我的资源</span>
        <div className="flex gap-2">
          {/* 新建文件夹 */}
          <Button 
            size="small" 
            type="primary"
            icon={<FolderAddOutlined />}
            className="bg-blue-600 hover:bg-blue-500 border-none text-xs shadow-md"
          >
            新建
          </Button>
          
          {/* 上传数据 */}
          <Upload 
            customRequest={customUploadRequest}
            showUploadList={false}
            accept=".json,.geojson,.csv"
          >
            <Button 
              type="primary" 
              size="small" 
              icon={<CloudUploadOutlined />}
              className="bg-blue-600 hover:bg-blue-500 border-none text-xs shadow-md"
            >
              上传
            </Button>
          </Upload>
        </div>
      </div>

      {/* 2. 树形列表区域 (Tree)
      */}
      <div className="flex-1 overflow-y-auto py-2">
        <style>{`
          .dark-tree .ant-tree-node-content-wrapper { 
            display: flex !important; 
            align-items: center;
            color: rgba(255, 255, 255, 0.85); 
            transition: all 0.3s;
            height: 32px !important; /* 增加一点行高，让点击区域更大 */
          }
          .dark-tree .ant-tree-node-content-wrapper:hover { 
            background-color: rgba(255, 255, 255, 0.08) !important; 
          }
          .dark-tree .ant-tree-treenode-selected .ant-tree-node-content-wrapper { 
            background-color: rgba(59, 130, 246, 0.2) !important; /* 使用 Tailwind 的 blue-500 透明度 */
          }
          /* 选中时的左侧高亮条，增加设计感（可选） */
          .dark-tree .ant-tree-treenode-selected .ant-tree-node-content-wrapper::before {
             content: '';
             position: absolute;
             left: 0;
             top: 0;
             bottom: 0;
             width: 3px;
             background-color: #3b82f6;
          }
          /* 修正图标的默认外边距 */
          .dark-tree .ant-tree-iconEle { 
             display: flex !important;
             align-items: center;
             justify-content: center;
             margin-right: 8px !important; /* 图标和文字的间距 */
          }
          .dark-tree .ant-tree-switcher { 
            color: rgba(255, 255, 255, 0.4); 
            display: flex !important;
            align-items: center;
            justify-content: center;
          }
        `}</style>

        {(!treeData || treeData.length === 0) ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-gray-500">暂无数据</span>} />
          </div>
        ) : (
          <Tree
            className="dark-tree bg-transparent"
            blockNode // 这个很重要，让整行都能点击
            showIcon={true} // 确保这里是 true
            defaultExpandAll
            selectedKeys={selectedKeys}
            onSelect={handleSelect}
            treeData={treeData}
            icon={getIcon}
            titleRender={titleRender}
            // 稍微美化一下展开的小三角
            switcherIcon={({ expanded }) => (
              <span className="text-zinc-500">
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