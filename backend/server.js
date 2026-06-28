const http = require("node:http");

const { handleRequest } = require("./routes");

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "127.0.0.1";

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    response.writeHead(500, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    response.end(
      JSON.stringify({
        ok: false,
        error: error.message || "Internal server error",
      }),
    );
  });
});

server.listen(PORT, HOST, () => {
  console.log(`TrustCAP backend listening at http://${HOST}:${PORT}`);
});
