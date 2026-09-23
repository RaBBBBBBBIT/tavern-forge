import Fastify from "fastify";
import { config } from "./config/index.js";

const app = Fastify({ logger: { level: config.logLevel } });

app.get("/api/v1/health", async () => ({
  name: "Tavern Forge",
  status: "ok",
  environment: config.nodeEnv,
}));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
