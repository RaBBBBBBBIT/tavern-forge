export type NodeEnvironment = "development" | "test" | "production";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  host: string;
  port: number;
  dataDir: string;
  appSecretKey: string;
  authUsername: string;
  authPassword: string;
  deepseekApiKey?: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  logLevel: LogLevel;
}

type Environment = Record<string, string | undefined>;

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`缺少必填配置：${name}`);
  return value;
}

function numberValue(environment: Environment, name: string, fallback: number): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error(`配置 ${name} 必须是 1 到 65535 之间的整数`);
  }
  return value;
}

function enumValue<T extends string>(environment: Environment, name: string, allowed: readonly T[], fallback: T): T {
  const value = environment[name]?.trim() || fallback;
  if (!allowed.includes(value as T)) throw new Error(`配置 ${name} 的值不受支持：${value}`);
  return value as T;
}

export function loadConfig(environment: Environment = process.env): AppConfig {
  return {
    nodeEnv: enumValue(environment, "NODE_ENV", ["development", "test", "production"], "development"),
    host: environment.HOST?.trim() || "127.0.0.1",
    port: numberValue(environment, "PORT", 3000),
    dataDir: environment.APP_DATA_DIR?.trim() || "./data",
    appSecretKey: required(environment, "APP_SECRET_KEY"),
    authUsername: required(environment, "AUTH_USERNAME"),
    authPassword: required(environment, "AUTH_PASSWORD"),
    deepseekApiKey: environment.DEEPSEEK_API_KEY?.trim() || undefined,
    deepseekBaseUrl: environment.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    deepseekModel: environment.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
    logLevel: enumValue(environment, "LOG_LEVEL", ["fatal", "error", "warn", "info", "debug", "trace"], "info"),
  };
}

export const config = loadConfig();
