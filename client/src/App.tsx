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

import './App.css';
import MainLayout from './layouts/MainLayout';

function App() {
  return (
    <MainLayout>
      {/* 左侧面板内容 - 资源管理器 */}
      <div className="text-gray-300">
        <p>左侧资源管理器内容区域</p>
        <ul className="mt-4 space-y-2">
          <li className="p-2 bg-geo-dark rounded">📁 项目文件夹</li>
          <li className="p-2 bg-geo-dark rounded">📄 sample.csv</li>
          <li className="p-2 bg-geo-dark rounded">📄 geo_data.geojson</li>
        </ul>
      </div>

      {/* 中间面板内容 - 数据透视表 */}
      <div className="text-gray-300">
        <p>中间数据透视表内容区域</p>
        <div className="mt-4 p-4 bg-geo-panel rounded">
          <p>这里是AG Grid数据表格</p>
          <div className="mt-2 text-xs text-gray-400">行数: 100 | 列数: 10</div>
        </div>
      </div>

      {/* 右侧面板内容 - 地图可视化 */}
      <div className="text-gray-300">
        <p>右侧地图可视化内容区域</p>
        <div className="mt-4 p-4 bg-gray-900 rounded h-full flex items-center justify-center">
          <div className="text-center">
            <p className="mb-2">🌍 地图容器</p>
            <p className="text-xs text-gray-500">MapLibre GL JS 将在此渲染</p>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

export default App
