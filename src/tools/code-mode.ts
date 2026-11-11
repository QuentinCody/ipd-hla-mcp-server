import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { ipdHlaCatalog } from "../spec/catalog";
import { createIpdHlaApiFetch } from "../lib/api-adapter";
import { ipdHlaResponse } from "../lib/tool-result";

interface CodeModeEnv {
    IPD_HLA_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createIpdHlaApiFetch();
    const register = server.tool.bind(server) as (...args: unknown[]) => void;
    const dualRegistrar = { tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const handler = rest.pop() as (args: unknown, extra: unknown) => Promise<any>;
        for (const alias of [String(name), `mcp_${String(name)}`]) register(alias, ...rest,
            (args: unknown, extra: unknown) => ipdHlaResponse(() => handler(args, extra), env, alias, extra, args));
    } };

    const searchTool = createSearchTool({
        prefix: "ipd_hla",
        catalog: ipdHlaCatalog,
    });
    searchTool.register(dualRegistrar);

    const executeTool = createExecuteTool({
        prefix: "ipd_hla",
        // Verifiable provenance: ipd_hla_execute results carry a _meta.citation.
        source: { id: "ipd_hla", name: "IPD-IMGT/HLA", url: "https://www.ebi.ac.uk/ipd/imgt/hla" },
        catalog: ipdHlaCatalog,
        apiFetch,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        preserveApiErrors: true,
        timeout: 45_000,
        doNamespace: env.IPD_HLA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(dualRegistrar);
}
