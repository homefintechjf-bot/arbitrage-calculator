import type { Express } from "express";
import { createServer, type Server } from "http";

const PYTHON_BACKEND = "http://127.0.0.1:8000";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.all("/api/{*path}", async (req, res) => {
    try {
      const url = `${PYTHON_BACKEND}${req.originalUrl}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      const isSSE = req.originalUrl.includes("/api/scan-progress");

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE") {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(url, fetchOptions);

      if (isSSE) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });

        if (response.body) {
          const reader = (response.body as any).getReader();
          const decoder = new TextDecoder();

          const pump = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(decoder.decode(value, { stream: true }));
              }
            } catch (e) {
              // Client disconnected
            } finally {
              res.end();
            }
          };
          pump();
        } else {
          res.end();
        }
        return;
      }

      const contentType = response.headers.get("content-type") || "application/json";
      res.status(response.status).set("Content-Type", contentType);

      const body = await response.text();
      res.send(body);
    } catch (error: any) {
      if (error.code === "ECONNREFUSED" || error.cause?.code === "ECONNREFUSED") {
        res.status(503).json({
          message: "Backend service starting up, please wait...",
          retryAfter: 5,
        });
      } else {
        console.error("Proxy error:", error.message);
        res.status(502).json({ message: "Backend service unavailable" });
      }
    }
  });

  return httpServer;
}
