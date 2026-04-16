require("dotenv").config();

const { config } = require("./config");
const { createKvClient } = require("./kvClient");
const { createApp } = require("./appFactory");

const kvClient = createKvClient(config.kv);
const app = createApp({
  kvClient,
  uploadConfig: config.upload,
});

app.listen(config.port, () => {
  // Keep logs metadata-only; never log audio payloads.
  console.log(`KV POC server listening on http://localhost:${config.port}`);
});
