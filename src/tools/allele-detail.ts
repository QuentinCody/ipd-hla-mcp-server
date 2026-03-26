import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ipdHlaFetch } from "../lib/http";
import {
    createCodeModeResponse,
    createCodeModeError,
} from "@bio-mcp/shared/codemode/response";
import { shouldStage, stageToDoAndRespond } from "@bio-mcp/shared/staging/utils";

interface AlleleDetailEnv {
    IPD_HLA_DATA_DO?: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(req: Request): Promise<Response> };
    };
}

export function registerAlleleDetail(server: McpServer, env?: AlleleDetailEnv): void {
    server.registerTool(
        "ipd_hla_allele_detail",
        {
            title: "Get HLA Allele Details",
            description:
                "Get full details for a specific HLA allele by ID. Returns sequence, features, cross-references, and nomenclature history.",
            inputSchema: {
                allele_id: z
                    .string()
                    .min(1)
                    .describe("Allele ID (e.g. 'HLA00001') or allele name (e.g. 'A*01:01:01:01')"),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: AlleleDetailEnv })?.env;
            try {
                const alleleId = String(args.allele_id).trim();
                const response = await ipdHlaFetch(`/allele/${encodeURIComponent(alleleId)}`);

                if (!response.ok) {
                    const body = await response.text().catch(() => "");
                    throw new Error(`IPD-HLA API error: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`);
                }

                const data = await response.json();

                const responseSize = JSON.stringify(data).length;
                if (shouldStage(responseSize) && runtimeEnv?.IPD_HLA_DATA_DO) {
                    const staged = await stageToDoAndRespond(
                        data,
                        runtimeEnv.IPD_HLA_DATA_DO as DurableObjectNamespace,
                        "allele_detail",
                        undefined,
                        undefined,
                        "ipd_hla",
                        (extra as { sessionId?: string })?.sessionId,
                    );
                    return createCodeModeResponse(
                        {
                            staged: true,
                            data_access_id: staged.dataAccessId,
                            _staging: staged._staging,
                            message: `Allele detail staged. Use ipd_hla_query_data with data_access_id '${staged.dataAccessId}' to query.`,
                        },
                        { meta: { staged: true, data_access_id: staged.dataAccessId } },
                    );
                }

                return createCodeModeResponse(data, {
                    meta: { fetched_at: new Date().toISOString() },
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return createCodeModeError("API_ERROR", `ipd_hla_allele_detail failed: ${msg}`);
            }
        },
    );
}
