import mongoose from 'mongoose';

/**
 * 数据库连接函数
 * 连接到本地 MongoDB 实例
 */
export const connectDB = async (): Promise<void> => {
  try {
    // MongoDB 连接字符串
    const mongoURI = 'mongodb://geoapp:geoapp123@localhost:27017/Geoex';
    
    // 连接到 MongoDB
    const conn = await mongoose.connect(mongoURI);
    
    console.log(`MongoDB 连接成功: ${conn.connection.host}`);
  } catch (error) {
    console.error('数据库连接失败:', error);
    process.exit(1); // 连接失败时退出进程
  }
};