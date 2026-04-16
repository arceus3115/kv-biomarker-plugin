require("dotenv").config();

const { config } = require("./config");
const { createLocalModelClient } = require("./localModelClient");
const { createApp } = require("./appFactory");

const localModelClient = createLocalModelClient(config.localModel);
const app = createApp({
  localModelClient,
  uploadConfig: config.upload,
});

app.listen(config.port, () => {
  // Keep logs metadata-only; never log audio payloads.
  console.log(`Local DAM POC server listening on http://localhost:${config.port}`);
});
