# Contributing

请先提出 Issue，说明使用的 `schemaVersion`、Node 版本、最小输入与预期行为。不要提交客户截图、密钥、私有 URL 或个人数据。

提交前运行：

```bash
npm run validate:skill
npm test
```

改动公开数据格式时，必须同时更新 Schema、运行时校验、示例、测试、README 和 CHANGELOG。新增视觉能力时，它必须是可选依赖，并在未安装时提供明确错误。
