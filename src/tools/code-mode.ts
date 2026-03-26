import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { ipdHlaCatalog } from "../spec/catalog";
import { createIpdHlaApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    IPD_HLA_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createIpdHlaApiFetch();

    const searchTool = createSearchTool({
        prefix: "ipd_hla",
        catalog: ipdHlaCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "ipd_hla",
        catalog: ipdHlaCatalog,
        apiFetch,
        doNamespace: env.IPD_HLA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
