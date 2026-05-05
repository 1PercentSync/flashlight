import { McpServer, StdioServerTransport } from "@modelcontextprotocol/server";

const server = new McpServer({ name: "flashlight", version: "0.1.0" });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
