import apiClient from './apiClient';

/**
 * 上传响应接口
 * 定义后端文件上传接口返回的数据结构
 * 
 * @interface UploadResponse
 * @property {number} code - 响应状态码
 * @property {string} message - 响应消息
 * @property {any} data - 响应数据，包含转换后的 GeoJSON
 */
// 上传响应接口，定义后端上传响应的数据结构
export interface UploadResponse {
  code: number;
  message: string;
  data: {
    geoJson: any; // 上传文件转换后的 GeoJSON 数据
    fileName: string; // 上传的文件名
    fileSize: number; // 文件大小
    fileType: string; // 文件类型
  } | null;
}

/**
 * 地理数据服务
 * 提供与地理数据处理相关的 API 接口
 * 
 * @author AQ
 * @description 封装与后端地理数据处理服务的通信逻辑
 */
// 定义类来进行service封装
// 把用户在浏览器里选好的文件，打包好，安全、准确地送到后端，并把回执拿回来
class GeoService {
  /**
   * 上传地理数据文件
   * 支持 CSV、GeoJSON 等格式的文件上传，并转换为 GeoJSON 格式
   * 
   * @param {File} file - 要上传的文件对象
   * @returns {Promise<UploadResponse>} 包含 GeoJSON 数据的响应对象
   * @throws {Error} 当上传失败时抛出错误
   * 
   * @example
   * const fileInput = document.querySelector('input[type="file"]');
   * const file = fileInput.files[0];
   * const result = await uploadGeoData(file);
   * console.log(result.data.geoJson); // 处理后的 GeoJSON 数据
   */
  // : Promise<UploadResponse>是输出承诺，会返回一个UploadResponse类型的数据
  // file是浏览器原生提供的文件对象(通常通过文件输入框获取)
  async uploadGeoData(file: File): Promise<UploadResponse> {
    try {
      // 构建表单数据，用于文件上传
      const formData = new FormData();
      
      // 将文件添加到表单数据中，字段名为 'file'
      // 第一个'file'与后端 Multer 中间件里的 upload.single('file')一致
      formData.append('file', file);
      
      // 发送 POST 请求到后端文件上传接口
      // 注意：Content-Type 会被自动设置为 multipart/form-data，包含边界字符串
      // await：“等待”。意思是：“在后端给我回复之前，代码先停在这儿，别往下跑。”
      const response = await apiClient.post<UploadResponse>('/files/upload', formData, {
        headers: {
          // 重要：当使用 FormData 时，不要手动设置 Content-Type
          // 浏览器会自动设置为 multipart/form-data 并添加正确的边界
          // 'Content-Type': 'multipart/form-data', // 这行会被浏览器忽略
        },
        // 上传大文件时显示进度（可选功能，后续可扩展）
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          console.log(`上传进度: ${progress}%`);
        },
      });

      return response.data;
    } catch (error: any) {
      // 错误处理：将错误转换为统一格式
      console.error('文件上传失败:', error);
      
      // 如果是 Axios 错误，提供更详细的信息
      if (error.response) {
        // 服务器响应了错误状态码
        throw new Error(`上传失败: ${error.response.data?.message || '服务器错误'} (${error.response.status})`);
      } else if (error.request) {
        // 请求已发出但没有收到响应
        throw new Error('网络错误: 无法连接到服务器');
      } else {
        // 其他错误
        throw new Error(`请求错误: ${error.message}`);
      }
    }
  }
}

// 导出 GeoService 实例，使其他模块可以直接使用
export const geoService = new GeoService();

// 导出 uploadGeoData 函数作为便捷方法
export const uploadGeoData = (file: File) => geoService.uploadGeoData(file);