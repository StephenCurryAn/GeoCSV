# 使用官方轻量级 Python 3.9 镜像
FROM python:3.9-slim

# 设置清华源，极大加速国内下载速度
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 安装数据科学基础包
RUN pip install --no-cache-dir pandas numpy scikit-learn

# 设置默认工作目录
WORKDIR /app
