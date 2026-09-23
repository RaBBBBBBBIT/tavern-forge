import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "./index.js";

const baseEnvironment = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: "4310",
  APP_DATA_DIR: "./test-data",
  APP_SECRET_KEY: "test-secret",
  AUTH_USERNAME: "admin",
  AUTH_PASSWORD: "test-password",
  DEEPSEEK_API_KEY: "test-key",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  DEEPSEEK_MODEL: "deepseek-chat",
  LOG_LEVEL: "debug",
};

test("加载类型化应用配置", () => {
  const config = loadConfig(baseEnvironment);

  assert.equal(config.nodeEnv, "test");
  assert.equal(config.port, 4310);
  assert.equal(config.authUsername, "admin");
  assert.equal(config.authPassword, "test-password");
  assert.equal(config.deepseekApiKey, "test-key");
});

test("缺少必填配置时启动失败", () => {
  const environment: Record<string, string | undefined> = { ...baseEnvironment };
  delete environment.APP_SECRET_KEY;

  assert.throws(() => loadConfig(environment), /缺少必填配置：APP_SECRET_KEY/);
});

test("非法端口号会被拒绝", () => {
  const environment = { ...baseEnvironment, PORT: "70000" };

  assert.throws(() => loadConfig(environment), /配置 PORT 必须是 1 到 65535 之间的整数/);
});
