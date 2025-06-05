# 拉取ChromaDB镜像
docker pull chromadb/chroma

# 启动ChromaDB容器
docker run -p 8000:8000 chromadb/chroma

# 或者，如果需要持久化数据
docker run -p 8000:8000 -v $(pwd)/chroma_data:/chroma/chroma chromadb/chroma


测试链接：
curl http://localhost:8000/api/v1/heartbeat