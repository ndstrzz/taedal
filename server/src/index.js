// server/src/index.js
const http = require("http");
const app = require("./app");

const PORT = Number(process.env.PORT || 5000);
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
