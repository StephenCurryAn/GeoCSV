import React, { useState, useRef, useEffect } from 'react';

const MainLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  // 1. 定义宽度状态 (统一使用 px，比百分比更精确且计算简单)
  const [sidebarWidth, setSidebarWidth] = useState<number>(260);
  const [tableWidth, setTableWidth] = useState<number>(500); // 给中间面板一个初始像素宽

  // 2. 使用 ref 存储拖拽过程中的临时数据，避免闭包陷阱
  // 最后面的（null）表示初始值，意味着组件刚加载时，没有进行拖拽操作，所以这个“口袋”是空的
  // Ref类型不会导致组件重新渲染，适合存储拖拽等临时状态
  const dragInfoRef = useRef<{
    type: 'sidebar' | 'table';
    startX: number;
    startWidth: number;
  } | null>(null);

  // 3. 开始拖拽
  //e.preventDefault() 阻止默认行为，避免拖拽时选中文字等问题 
  const handleMouseDown = (type: 'sidebar' | 'table', e: React.MouseEvent) => {
    e.preventDefault();
    dragInfoRef.current = {
      type,
      startX: e.clientX,
      startWidth: type === 'sidebar' ? sidebarWidth : tableWidth,
    };
    
    // 拖拽时添加鼠标全局样式，并防止选中文字，提升体验
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    
    // 绑定事件到 document，保证鼠标移出组件也能响应
    // mousemove表示鼠标移动；mouseup表示鼠标释放（一旦松手，就触发 handleMouseUp 函数）
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 4. 拖拽移动 (提取出来，不依赖 state)
  const handleMouseMove = (e: MouseEvent) => {
    if (!dragInfoRef.current) return;

    const { type, startX, startWidth } = dragInfoRef.current;
    const deltaX = e.clientX - startX; // 计算鼠标移动距离

    if (type === 'sidebar') {
      // 限制左侧面板最小 150px，最大 500px
      const newWidth = Math.max(150, Math.min(500, startWidth + deltaX));
      setSidebarWidth(newWidth);
    } else if (type === 'table') {
      // 限制中间面板最小 200px，最大剩余空间的 80% (简单做个最大限制)
      // 注意：这里是调整 Table 的宽度
      const newWidth = Math.max(200, Math.min(window.innerWidth - sidebarWidth - 100, startWidth + deltaX));
      setTableWidth(newWidth);
    }
  };

  // 5. 结束拖拽
  const handleMouseUp = () => {
    dragInfoRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // 移除监听器
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
  
  // 6. 清理副作用 (组件卸载时确保监听器被移除)
  // []空数组表示这个副作用只在组件挂载时候运行一次，并且只在卸载时运行一次
  // return () => { ... } 这是一个清理函数，在组件卸载时候调用 
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const childrenArray = React.Children.toArray(children);

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-row bg-geo-dark select-none">
      
      {/* --- 左侧面板 --- */}
      <div
        className="shrink-0 flex flex-col bg-geo-panel border-r border-geo-border"
        style={{ width: `${sidebarWidth}px`, transition: dragInfoRef.current ? 'none' : 'width 0.1s' }}
      >
        <div className="h-12 flex items-center px-4 border-b border-geo-border">
          <h2 className="text-sm font-medium text-geo-text-primary">资源管理器</h2>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {childrenArray[0]}
        </div>
      </div>

      {/* --- 拖拽条 1 (左侧 <-> 中间) --- */}
      {/* 如果你确实希望左侧固定，可以移除 onMouseDown 事件，或者保留它用来调整左侧宽度 */}
      <div
        className="w-1 hover:w-2 -ml-0.5 z-10 cursor-col-resize hover:bg-geo-accent transition-all flex items-center justify-center group"
        onMouseDown={(e) => handleMouseDown('sidebar', e)}
      >
         <div className="w-0.5 h-full bg-transparent group-hover:bg-geo-accent opacity-50 transition-opacity" />
      </div>

      {/* --- 中间面板 --- */}
      <div
        className="shrink-0 flex flex-col bg-geo-dark"
        style={{ width: `${tableWidth}px` }}
      >
        <div className="h-12 flex items-center px-4 border-b border-geo-border">
          <h2 className="text-sm font-medium text-geo-text-primary">数据透视</h2>
        </div>
        <div className="flex-1 overflow-hidden p-2">
          {childrenArray[1]}
        </div>
      </div>

      {/* --- 拖拽条 2 (中间 <-> 右侧) --- */}
      <div
        className="w-1 hover:w-2 -ml-0.5 z-10 cursor-col-resize hover:bg-geo-accent transition-all flex items-center justify-center group"
        onMouseDown={(e) => handleMouseDown('table', e)}
      >
         <div className="w-0.5 h-full bg-transparent group-hover:bg-geo-accent opacity-50 transition-opacity" />
      </div>

      {/* --- 右侧面板 (自动填充剩余空间) --- */}
      <div className="flex-1 flex flex-col min-w-50 bg-linear-to-br from-geo-panel to-black">
        <div className="h-12 flex items-center px-4 border-b border-geo-border">
          <h2 className="text-sm font-medium text-geo-text-primary">地图可视化</h2>
        </div>
        <div className="flex-1 overflow-hidden relative">
          {childrenArray[2]}
        </div>
      </div>

    </div>
  );
};

export default MainLayout;