import express from "express";
import { createServer } from "http";
import { createServer as createViteServer } from "vite";
import { attachWebSocket } from "./api/chatSocket.js";

const app = express();
const port = 3001;

app.get("/", (_req, res) => {
  res.redirect(302, `/sessions/new`);
});

const vite = await createViteServer({
  root: "src/web-ui",
  configFile: "vite.config.ts",
  server: {
    middlewareMode: true,
    watch: { usePolling: true },
  },
});
app.use(vite.middlewares);

// Serve index.html for all non-API, non-asset routes (SPA fallback)
app.use("*", async (req, res, next) => {
  try {
    const html = await vite.transformIndexHtml(req.originalUrl, 
      (await import("fs")).readFileSync("src/web-ui/index.html", "utf-8")
    );
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    next(e);
  }
});

const server = createServer(app);
attachWebSocket(server);

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
