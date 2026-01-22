import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider, theme } from 'antd' // 引入 AntdApp 和主题配置
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 1. 设置全局深色主题 (Dark Algorithm) */}
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      {/* 2. 使用 AntdApp 包裹，提供 Context 上下文 */}
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
