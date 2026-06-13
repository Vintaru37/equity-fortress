import { createServer } from "vite";

const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  clearScreen: false,
});

await server.listen();
server.printUrls();
