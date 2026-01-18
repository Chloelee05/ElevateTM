import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import { buildPipeline, generateReport } from "./agent_pipeline.mjs";
import { create_initial_state, play_round, build_report_context, predict_ai_bid } from "./game_core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

let state = create_initial_state();
const graph = buildPipeline();
let pendingAi = null;

async function refreshPrediction() {
  const res = await predict_ai_bid(state, graph);
  if (!res) {
    pendingAi = null;
    return;
  }
  const [bid, reasons] = res;
  pendingAi = { bid, reasons };
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function stateToJson(s) {
  return JSON.parse(JSON.stringify(s));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function parseJson(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (url.pathname === "/api/state" && req.method === "GET") {
      return json(res, 200, { state: stateToJson(state) });
    }

    if (url.pathname === "/api/bid" && req.method === "POST") {
      let payload = {};
      try {
        payload = await parseJson(req);
      } catch {
        return json(res, 400, { error: "Invalid JSON." });
      }

      const bid = Number(payload.bid);
      if (!Number.isFinite(bid) || bid < 0 || bid > state.player.money) {
        return json(res, 400, { error: `Bid must be between 0 and ${state.player.money}.` });
      }

      const outcome = await play_round(state, bid, graph, pendingAi);
      pendingAi = null;
      let report = null;
      if (outcome.status === "ended") {
        report = await generateReport(build_report_context(state));
      }

      const payloadOut = {
        outcome,
        state: stateToJson(state),
        report,
      };

      json(res, 200, payloadOut);
      if (outcome.status === "ok") {
        refreshPrediction().catch(() => {
          pendingAi = null;
        });
      }
      return;
    }

    if (url.pathname === "/api/start" && req.method === "POST") {
      await refreshPrediction();
      return json(res, 200, { ok: true, state: stateToJson(state) });
    }

    if (url.pathname === "/api/restart" && req.method === "POST") {
      state = create_initial_state();
      pendingAi = null;
      return json(res, 200, { ok: true, state: stateToJson(state) });
    }

    const reqPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = path.normalize(path.join(publicDir, reqPath));
    if (!safePath.startsWith(publicDir)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    const data = await readFile(safePath);
    res.writeHead(200, { "Content-Type": contentTypeFor(safePath) });
    return res.end(data);
  } catch (err) {
    res.writeHead(500);
    return res.end("Server error");
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
