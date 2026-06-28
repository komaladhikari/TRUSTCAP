const fs = require("node:fs/promises");
const path = require("node:path");

const FEATURE_COLUMNS = [
  "total_time",
  "number_of_moves",
  "number_of_clicks",
  "average_speed",
  "max_speed",
  "pause_count",
  "path_length",
];

const DATASETS = {
  normal: path.resolve(__dirname, "..", "ml", "data", "normal.csv"),
  shifted: path.resolve(__dirname, "..", "ml", "data", "shifted.csv"),
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON"));
      }
    });

    request.on("error", reject);
  });
}

function validateFeatures(features) {
  if (!features || typeof features !== "object" || Array.isArray(features)) {
    throw new Error("features must be an object");
  }

  return FEATURE_COLUMNS.map((column) => {
    const value = Number(features[column]);

    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${column} must be a non-negative number`);
    }

    return value;
  });
}

async function appendSample(payload) {
  const label = payload.label === "shifted" ? "shifted" : "normal";
  const datasetPath = DATASETS[label];
  const values = validateFeatures(payload.features);
  const row = [...values, label].join(",");

  await fs.appendFile(datasetPath, `${row}\n`, "utf8");

  return {
    label,
    savedTo: path.relative(path.resolve(__dirname, ".."), datasetPath),
    row: [...FEATURE_COLUMNS, "label"].reduce((record, column, index) => {
      record[column] = index < FEATURE_COLUMNS.length ? values[index] : label;
      return record;
    }, {}),
  };
}

async function handleRequest(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, { ok: true, service: "trustcap-backend" });
    return;
  }

  if (request.method === "POST" && request.url === "/api/samples") {
    try {
      const payload = await readJsonBody(request);
      const savedSample = await appendSample(payload);

      sendJson(response, 201, {
        ok: true,
        message: `Saved ${savedSample.label} training sample`,
        sample: savedSample,
      });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error.message,
      });
    }

    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "Route not found",
  });
}

module.exports = {
  FEATURE_COLUMNS,
  handleRequest,
};
