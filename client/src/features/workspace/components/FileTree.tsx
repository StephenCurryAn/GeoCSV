import React, { useState, useEffect, useRef } from 'react';
import { Tree, Button, Empty, Input, Dropdown, type MenuProps, App as AntdApp } from 'antd'; // 引入 Empty 组件美化空状态
import { FolderAddOutlined, CloudUploadOutlined, FileTextOutlined, FileImageOutlined, TableOutlined, FolderFilled, CheckOutlined, DownOutlined, DeleteOutlined, EditOutlined, ExclamationCircleOutlined} from '@ant-design/icons';
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
  onDataLoaded: (fileName: string, data: any, fileId: string) => void;
  onSelectFile?: (fileName: string, fileId: string) => void;
}

// 创建文件树组件，并将FileTreeProps作为属性类型（制定规则）
// onDataLoaded是一个回调函数，类型是(FileName: string, data: any) => void (对象解构，可以直接用onDataLoaded变量名)
const FileTree: React.FC<FileTreeProps> = ({ onDataLoaded, onSelectFile }) => {
  // ✅ 1. 使用 Hook 获取带上下文的实例
  const { message, modal } = AntdApp.useApp();
  // 状态管理
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);

  // 🆕 新增状态：控制重命名
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const inputRef = useRef<any>(null); // 用于自动聚焦输入框
  // 🚨【新增】用于触发原生文件选择的 Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // TreeNode[]表示 TreeNode 类型的数组

  // 对于这个初始化的树，如果使用...展开为数组，展开后数组里只有 2 个元素：[root节点, sample1节点]
  // 浅拷贝，顶层遍历，children 还是引用类型，依然被包裹在这个对象内部，并没有被拿出来
  // 如果想通过 ... 把树形结构变成一个扁平的一维数组，需要写一个递归函数来实现

  // 组件挂载时获取文件树数据
  useEffect(() => {
    fetchFileTree();
  }, []);

  // 从后端获取文件树数据
  const fetchFileTree = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/files/tree');
      const result = await response.json();

      if (result.code === 200) {
        setTreeData(result.data);
      } else {
        throw new Error(result.message || '获取文件树失败');
      }
    } catch (error: any) {
      console.error('获取文件树错误:', error);
      message.error(`获取文件树失败: ${error.message}`);
    }
  };

  // 辅助函数：根据文件名获取图标
  // 图标逻辑：根据文件类型返回不同颜色图标
  const getIcon = (props: any) => {
    if (props.type === 'folder') {
      return <FolderFilled className="text-yellow-500! text-lg" />;
    }
    const ext = (props.title || '').toLowerCase().split('.').pop();
    switch (ext) {
      case 'csv': return <TableOutlined className="text-green-400! " />;
      case 'xlsx': return <TableOutlined className="text-green-400!" />;
      case 'json': return <FileImageOutlined className="text-gray-400!" />;
      case 'geojson': return <FileImageOutlined className="text-gray-400!" />;
      default: return <FileTextOutlined className="text-gray-400!" />;
    }
  };
  // 标题渲染逻辑：实现"右侧对勾"效果
  const titleRender = (node: any) => {
    const isSelected = selectedKeys.includes(node.key);
    const isEditing = editingKey === node.key; // 判断是否处于编辑模式
    const icon = getIcon(node);

    // 定义右键菜单项
    const menuItems: MenuProps['items'] = [
        {
            key: 'rename',
            label: '重命名',
            icon: <EditOutlined />,
            onClick: () => {
                setEditingKey(node.key);
                setEditingValue(node.title); // 初始值为当前标题
                // 稍微延迟一下聚焦，等待 DOM 渲染 Input
                setTimeout(() => inputRef.current?.focus(), 100);
            }
        },
        {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDelete(node.key, node.title)
        }
    ];

    // 渲染内容
    const content = (
        <div 
            className="flex items-center w-full pr-2 group h-8"
            // 双击触发重命名
            onDoubleClick={(e) => {
                e.stopPropagation(); // 防止触发展开折叠
                setEditingKey(node.key);
                setEditingValue(node.title);
            }}
        >
            <span className="mr-2 flex items-center justify-center shrink-0 min-w-5">
                {icon}
            </span>

            {/* 编辑模式 vs 浏览模式 */}
            {isEditing ? (
                <Input
                    ref={inputRef}
                    size="small"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onPressEnter={() => handleRenameSave(node.key)}
                    onBlur={() => {
                         // 失去焦点时，保存还是取消？通常是保存。
                         // 如果不想自动保存，可以写 setEditingKey(null)
                         handleRenameSave(node.key); 
                    }}
                    onClick={(e) => e.stopPropagation()} // 防止点击输入框时触发树节点的选中
                    className="flex-1 h-6 text-xs"
                />
            ) : (
                <span className={`flex-1 truncate transition-colors ${isSelected ? 'text-blue-300 font-medium' : 'text-gray-200 group-hover:text-blue-400'}`}>
                    {node.title}
                </span>
            )}

            {isSelected && !isEditing && <CheckOutlined className="text-blue-500 text-sm ml-2" />}
        </div>
    );
    // 如果正在编辑，不需要右键菜单（或者你可以保留）
    if (isEditing) {
        return content;
    }

    // 使用 Dropdown 实现右键菜单
    return (
        <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
            {content}
        </Dropdown>
    );

    // return (
    //   // 外层容器：Flex 布局，垂直居中
    //   <div className="flex items-center w-full pr-2 group h-8">
        
    //     {/* 左侧：图标区 (固定宽度或由内容撑开，加个 margin-right) */}
    //     <span className="mr-2 flex items-center justify-center shrink-0 min-w-5">
    //       {icon}
    //     </span>

    //     {/* 中间：文件名 (flex-1 占据剩余空间，防止文字过长遮挡图标) */}
    //     <span className={`flex-1 truncate transition-colors ${isSelected ? 'text-blue-500 font-medium' : 'text-gray-500 group-hover:text-blue-400'}`}>
    //       {node.title}
    //     </span>

    //     {/* 右侧：选中对勾 */}
    //     {isSelected && <CheckOutlined className="text-blue-500 text-sm ml-2" />}
    //   </div>
    // );
  };

  const handleRenameSave = async (key: string) => {
    if (!editingValue.trim()) {
        message.warning('名称不能为空');
        setEditingKey(null);
        return;
    }
    try {
        await geoService.renameNode(key, editingValue);
        message.success('重命名成功');
        setEditingKey(null);
        fetchFileTree(); // 刷新树以获取最新状态
    } catch (error: any) {
        message.error(error.message);
        // 即使失败也要退出编辑模式，或者保持编辑模式让用户修改
        // 这里选择保持编辑模式
        inputRef.current?.focus();
    }
  };

  // 🆕 新增：处理删除
  const handleDelete = (key: string, title: string) => {
    modal.confirm({
        title: '确认删除',
        icon: <ExclamationCircleOutlined />,
        content: `确定要删除 "${title}" 吗？如果是文件夹，里面的内容也会被删除。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
            try {
                await geoService.deleteNode(key);
                message.success('删除成功');
                // 如果删除的是当前选中的文件，清空选中状态
                if (selectedKeys.includes(key)) {
                    setSelectedKeys([]);
                }
                fetchFileTree(); // 刷新树
            } catch (error: any) {
                message.error(error.message);
            }
        }
    });
  };

  /**
   * 🚨【新增】处理文件选择 (替代 customUploadRequest)
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 获取 targetParentId
    const currentSelectedKey = selectedKeys[0];
    let targetParentId = undefined;
    if (currentSelectedKey) {
        const targetNode = findNodeByKey(treeData, currentSelectedKey);
        if (targetNode && targetNode.type === 'folder') {
            targetParentId = currentSelectedKey;
        }
    }

    const hideLoading = message.loading('正在上传并解析...', 0);

    try {
        // 🚨 调用 geoService 里的新方法 (支持 FileList)
        const response: UploadResponse = await geoService.uploadGeoData(files, targetParentId);
        
        hideLoading();

        if (response.code === 200 && response.data) {
            message.success(`${response.data.fileName} 上传成功！`);
            
            // 1. 通知父组件显示数据
            if (response.data.geoJson) {
                onDataLoaded(response.data.fileName, response.data.geoJson, response.data._id);
            }

            // 2. 构造新节点
            const newFileNode: TreeNode = {
                key: response.data._id,
                title: response.data.fileName,
                type: 'file',
                rawFileName: response.data.fileName,
                isLeaf: true
            };

            // 3. 更新树
            setTreeData(prev => {
                if (targetParentId) {
                    return insertNodeToTree(prev, targetParentId, newFileNode);
                } else {
                    return [...prev, newFileNode];
                }
            });

            // 4. 选中新文件
            setSelectedKeys([newFileNode.key]);
            
            // 5. 稍微延迟刷新全树
            setTimeout(fetchFileTree, 500);

        } else {
            throw new Error(response.message || '上传未返回有效数据');
        }

    } catch (error: any) {
        hideLoading();
        message.error(`上传失败: ${error.message}`);
        console.error(error);
    } finally {
        // 🚨 必须清空 input 的值，否则删除文件后再次上传同名文件不会触发 onChange
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }
  };

  // 选中逻辑
  // 这里用info作为参数是因为：
  // “点击” (Select) 这个动作包含的信息很多，不仅仅是“点了谁”
  // Ant Design 把它们打包在 info 对象里，是为了扩展性。
  // info 对象里通常包含：
  // info.node: 点了谁（主角）；
  // info.selected: 现在是不是选中状态（布尔值）；
  // info.event: 一些原生事件对象（用于处理右键菜单、阻止冒泡等）；
  // 以及其他一些辅助信息，方便你根据具体情况做不同的处理。
  const handleSelect = (keys: React.Key[], info: any) => {
    const key = keys[0] as string;
    if (!key) return;
    
    setSelectedKeys([key]); //改变状态，会触发组件重新渲染

    // && onSelectFile，检查父组件 (App) 是否传了这个回调函数给我们
    // onSelectFile(info.node.rawFileName)，把这个文件的原始文件名 (rawFileName) 扔给父组件
    if (info.node.type === 'file' && onSelectFile) {
      // 🚨【修改这里】兼容逻辑：
      // 1. 刚上传时，有 rawFileName
      // 2. 从数据库加载时，只有 title (它就是文件名)
      // 所以：如果 rawFileName 没值，就取 title
      const fileName = info.node.rawFileName || info.node.title;
      
      onSelectFile(fileName, key);
    }
  };

  // 根据 Key 查找节点的函数 (用于判断选中的是不是文件夹)
  const findNodeByKey = (nodes: TreeNode[], key: string): TreeNode | null => {
    for (const node of nodes) {
      if (node.key === key) {
        return node;
      }
      if (node.children) {
        const found = findNodeByKey(node.children, key);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  // 递归插入节点 (用于把文件塞进深层文件夹)
  const insertNodeToTree = (nodes: TreeNode[], targetKey: string, newNode: TreeNode): TreeNode[] => {
    // map 会返回一个新数组，每个节点都经过处理
    return nodes.map((node) => {
      // 找到了目标文件夹
      if (node.key === targetKey) {
        return {
          ...node,
          // 这里的逻辑是：保留原有的 children，追加 newNode
          children: [...(node.children || []), newNode],
          // 这一步是为了确保文件夹被标记为非叶子，且展开它（可选）
          isLeaf: false, 
        };
      }
      // 如果还没找到，继续往深处找
      if (node.children) {
        return {
          ...node,
          children: insertNodeToTree(node.children, targetKey, newNode),
        };
      }
      // 如果当前节点既不是目标，也没有子节点（或者是死胡同），那就原封不动地返回它
      // 节省内存和性能，不用重新创建对象，不用重新渲染
      return node;
    });
  };
  
  // 新建文件夹处理函数
  const handleCreateFolder = async () => {
    const folderName = prompt('请输入文件夹名称:');
    if (!folderName) return;

    try {
      // 获取当前选中的节点
      const currentSelectedKey = selectedKeys[0];
      let parentId = null;

      // 如果当前选中的是一个文件夹，则将新文件夹创建在该文件夹内
      if (currentSelectedKey) {
        const targetNode = findNodeByKey(treeData, currentSelectedKey);
        if (targetNode && targetNode.type === 'folder') {
          parentId = currentSelectedKey;
        }
      }

      // 调用后端API创建文件夹
      const response = await fetch('http://localhost:3000/api/files/folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: folderName,
          parentId: parentId
        })
      });

      const result = await response.json();

      if (result.code === 200) {
        // 创建成功，更新树数据
        const newFolderNode: TreeNode = {
          key: result.data._id, // 使用后端返回的ID
          title: folderName,
          type: 'folder',
          isLeaf: false,
          children: [] // 文件夹初始化要有 children
        };

        message.success('文件夹创建成功！');

        // ✅ 新增：使用 setTreeData 把新文件夹立即显示出来 (消除警告)
        setTreeData(prev => {
          // 这里的逻辑和上传文件成功后的逻辑一样
          if (parentId) {
            // 如果是在某个父文件夹下创建，递归插入
            return insertNodeToTree(prev, parentId, newFolderNode);
          } else {
            // 如果是根目录，直接追加
            return [...prev, newFolderNode];
          }
        });

        // 创建成功后，重新获取文件树数据以同步后端数据库状态
        setTimeout(() => {
          fetchFileTree();
        }, 500); // 延迟执行，确保后端有时间处理数据
      } else {
        throw new Error(result.message || '创建文件夹失败');
      }
    } catch (error: any) {
      console.error('创建文件夹错误:', error);
      message.error(`创建文件夹失败: ${error.message}`);
    }
  };

  // 处理树点击事件（用于取消选中）
  const handleTreeClick = (e: React.MouseEvent) => {
    // 检查是否点击了树节点之外的空白区域
    // 如果点击的是树的背景而非具体的节点，则取消选中
    if ((e.target as HTMLElement).closest('.ant-tree') &&
        !(e.target as HTMLElement).closest('.ant-tree-treenode')) {
      setSelectedKeys([]); // 清空选中状态
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
            className="text-gray-200! bg-blue-600 hover:bg-blue-500 border-none text-xs shadow-md"
            onClick={handleCreateFolder}
          >
            新建
          </Button>

          {/* 上传数据 */}
          {/* <Upload
            customRequest={customUploadRequest}
            showUploadList={false}
            accept=".json,.geojson,.csv"
          >
            <Button
              type="primary"
              size="small"
              icon={<CloudUploadOutlined />}
              className="text-gray-200! bg-blue-600 hover:bg-blue-500 border-none text-xs shadow-md"
            >
              上传
            </Button>
          </Upload> */}
          {/* 🚨【核心修改】1. 隐藏的原生 input */}
          <input 
            type="file" 
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple // 允许选多个
            accept=".json,.geojson,.csv,.shp,.dbf,.shx,.prj,.cpg"
            onChange={handleFileChange}
          />

          {/* 🚨【核心修改】2. 触发 input 点击的按钮 */}
          <Button
              type="primary"
              size="small"
              icon={<CloudUploadOutlined />}
              className="text-gray-200! bg-blue-600 hover:bg-blue-500 border-none text-xs shadow-md"
              onClick={() => fileInputRef.current?.click()} // 触发点击
          >
              上传
          </Button>
        </div>
      </div>

      {/* 2. 树形列表区域 (Tree)
      */}
      <div className="flex-1 overflow-y-auto py-2" onClick={handleTreeClick}>
        {/* 🎨 样式注入：覆盖 Ant Design 默认的白色样式，适配黑色炫酷主题 */}
        <style>{`
          /* 1. 核心：强制移除 Tree 组件的默认白色背景和黑色文字 */
          .dark-tree.ant-tree {
            background: transparent !important;
            color: #ffffff !important; /* ✨ 从 #9ca3af 改为 #e5e7eb (更亮) */
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          }

          /* 2. 节点行样式 */
          .dark-tree .ant-tree-node-content-wrapper {
            display: flex !important;
            align-items: center;
            transition: all 0.2s;
            height: 32px !important;
            padding: 0 6px !important;
            color: #e5e7eb !important; /* ✨ 同样改为 #e5e7eb */
            border-radius: 4px;
          }

          /* 3. 悬停效果 (Hover)：淡淡的白色微光 */
          .dark-tree .ant-tree-node-content-wrapper:hover {
            background-color: rgba(255, 255, 255, 0.08) !important;
            color: #e5e7eb !important; /* text-gray-200 */
          }

          /* 4. 选中效果 (Selected)：科技蓝背景 + 高亮文字 */
          .dark-tree .ant-tree-treenode-selected .ant-tree-node-content-wrapper {
            background-color: rgba(37, 99, 235, 0.15) !important; /* 深蓝透明背景 */
            color: #60a5fa !important; /* text-blue-400 */
          }

          /* 5. 选中时的左侧高亮指示条 (装饰性细节) */
          .dark-tree .ant-tree-treenode-selected .ant-tree-node-content-wrapper::before {
             content: '';
             position: absolute;
             left: 0;
             top: 50%;
             transform: translateY(-50%);
             height: 14px;
             width: 3px;
             background-color: #3b82f6; /* blue-500 */
             border-radius: 0 2px 2px 0;
             box-shadow: 0 0 8px rgba(59, 130, 246, 0.6); /* 加一点发光效果 */
          }

          /* 6. 修正图标位置 */
          .dark-tree .ant-tree-iconEle {
             display: flex !important;
             align-items: center;
             justify-content: center;
             margin-right: 8px !important;
          }

          /* 7. 修正展开/折叠小箭头的颜色 */
          .dark-tree .ant-tree-switcher {
            background: transparent !important;
          }
          .dark-tree .ant-tree-switcher-icon {
            color: #6b7280 !important; /* gray-500 */
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
            showIcon={false}
            defaultExpandAll
            selectedKeys={selectedKeys}
            onSelect={handleSelect}
            treeData={treeData}
            // icon={getIcon}
            titleRender={titleRender}
            // 稍微美化一下展开的小三角
            switcherIcon={({ expanded }) => (
              // <span className="text-zinc-500">
              //   {/* {expanded ? '▼' : '▶'} */}
              //   {expanded ? '⌄' : '>'}
              // </span>
              <span
                className="
                  flex items-center justify-center
                  text-gray-400       /* 1. 修改颜色：这里改成浅灰色，你可以改 */
                  hover:text-white    /* 可选：鼠标悬停时变亮 */
                  transition-transform duration-200 /* 可选：添加平滑过渡效果 */
                "
              >
                {expanded ? (
                  <DownOutlined
                    /* 2. 修改粗细：Ant Design 图标默认很细，通过加描边来实现“加粗”效果 */
                    style={{ strokeWidth: '150', stroke: 'currentColor' }}
                  />
                ) : (
                  <DownOutlined
                    style={{ strokeWidth: '150', stroke: 'currentColor' }}
                  />
                )}
              </span>
            )}
          />
        )}
      </div>
    </div>
  );
};

export default FileTree;