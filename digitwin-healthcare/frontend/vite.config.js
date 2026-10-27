import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function autoStartBackendPlugin() {
  let backendProc = null;

  function checkPort(port, host = "127.0.0.1") {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(400);
      sock.on("connect", () => {
        sock.destroy();
        resolve(true);
      });
      sock.on("timeout", () => {
        sock.destroy();
        resolve(false);
      });
      sock.on("error", () => {
        resolve(false);
      });
      sock.connect(port, host);
    });
  }

  function killBackend() {
    if (backendProc && !backendProc.killed) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", backendProc.pid.toString(), "/f", "/t"]);
        } else {
          backendProc.kill("SIGTERM");
        }
      } catch (_) {}
      backendProc = null;
    }
  }

  return {
    name: "auto-start-backend",
    apply: "serve",
    async configureServer(server) {
      const isRunning = await checkPort(8000);
      if (isRunning) {
        console.log("\x1b[32m[DigiTwin]\x1b[0m Backend is already online at http://127.0.0.1:8000");
        return;
      }

      console.log("\x1b[36m[DigiTwin]\x1b[0m Starting DigiTwin Python backend on http://127.0.0.1:8000...");
      const backendDir = path.resolve(__dirname, "../backend");

      backendProc = spawn(
        "python",
        ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"],
        {
          cwd: backendDir,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        }
      );

      const handleOutput = (d) => {
        const text = d.toString();
        if (text.includes("Uvicorn running") || text.includes("Application startup complete")) {
          console.log(`\x1b[32m[DigiTwin Backend]\x1b[0m Ready on http://127.0.0.1:8000`);
        } else if (text.includes("ERROR") || text.includes("Traceback") || text.includes("Error:") || text.includes("Exception")) {
          console.error(`\x1b[31m[DigiTwin Backend Error]\x1b[0m ${text.trimEnd()}`);
        }
      };

      backendProc.stdout?.on("data", handleOutput);
      backendProc.stderr?.on("data", handleOutput);

      backendProc.on("error", (err) => {
        console.error("\x1b[31m[DigiTwin]\x1b[0m Could not start backend:", err.message);
      });

      process.on("exit", killBackend);
      process.on("SIGINT", () => {
        killBackend();
        process.exit();
      });
      process.on("SIGTERM", () => {
        killBackend();
        process.exit();
      });

      server.httpServer?.on("close", killBackend);
    },
  };
}

export default defineConfig({
  plugins: [react(), autoStartBackendPlugin()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
          if (id.includes("node_modules/@react-three/fiber/")) return "react-three-fiber";
          if (id.includes("node_modules/@react-three/drei/")) return "react-three-drei";
        },
      },
    },
  },
});

