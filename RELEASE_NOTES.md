## 重要更新说明

### 数据迁移注意事项

**本版本进行了重大的数据存储架构调整，旧版本的数据将无法自动迁移。**

升级到此版本后，您需要手动重新录入项目数据。

#### 如何查看旧数据

您可以使用 `extract_old_data.bat`（Windows）脚本来提取查看原来的数据，以便知道需要重新录入哪些内容：

```bash
# Windows
双击运行 extract_old_data.bat
```

脚本会从旧的 localStorage 数据中提取并显示您之前保存的项目信息。

#### 新版本的数据存储

- 数据现在存储在应用安装目录下的 `data/` 文件夹中
- 日志存储在 `logs/` 文件夹中
- 数据格式更加简洁，便于备份和迁移

---

如有问题，请在 [GitHub Issues](https://github.com/anthropics/codeshelf/issues) 反馈。
