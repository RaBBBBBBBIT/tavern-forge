# 服务端配置

服务端配置只由 `index.ts` 读取和校验。其他模块不得直接访问 `process.env`。

## 本地配置

项目根目录使用：

```text
.env
.env.example
```

`.env` 不提交 Git，`.env.example` 可以提交。DeepSeek Key 写入 `.env` 的 `DEEPSEEK_API_KEY`，不能写入前端配置或提交记录。

当前 MVP 的单用户账号配置为：

```env
AUTH_USERNAME=admin
AUTH_PASSWORD=本机密码
```

这是自托管单用户模式的简化方案，密码会在服务进程内存中使用，不写入 SQLite。
