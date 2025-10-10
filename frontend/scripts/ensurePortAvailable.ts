import { createServer } from "node:net";
import { env, exit } from "node:process";

function resolvePort(): number {
  const candidates = [env.VITE_DEV_PORT, env.PORT, "5173"];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Number.parseInt(candidate, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }

  throw new Error("无法解析目标端口，可通过 VITE_DEV_PORT 指定");
}

async function ensurePortAvailable(): Promise<void> {
  const port = resolvePort();

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const server = createServer();

    server.once("error", (error: NodeJS.ErrnoException) => {
      server.close(() => {
        rejectPromise(error);
      });
    });

    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolvePromise());
    });
  });

  console.log(`✅ 开发端口 ${port} 可用`);
}

ensurePortAvailable()
  .then(() => exit(0))
  .catch((error: NodeJS.ErrnoException) => {
    const message =
      error.code === "EADDRINUSE"
        ? `端口 ${resolvePort()} 已被占用，请修改 VITE_DEV_PORT 或释放端口`
        : error.message;
    console.error(`❌ 端口检测失败: ${message}`);
    exit(1);
  });
