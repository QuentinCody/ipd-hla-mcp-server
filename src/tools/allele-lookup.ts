import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ipdHlaFetch } from "../lib/http";
import {
    createCodeModeResponse,
    createCodeModeError,
} from "@bio-mcp/shared/codemode/response";
import { shouldStage, stageToDoAndRespond } from "@bio-mcp/shared/staging/utils";

interface AlleleLookupEnv {
    IPD_HLA_DATA_DO?: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(req: Request): Promise<Response> };
    };
}

export function registerAlleleLookup(server: McpServer, env?: AlleleLookupEnv) {
    server.registerTool(
        "ipd_hla_allele_lookup",
        {
            title: "Search HLA Alleles",
            description:
                "Search the IPD-IMGT/HLA database for alleles by name, locus, or allele group. Uses MongoDB-style query syntax. Returns paginated allele list.",
            inputSchema: {
                query: z
                    .string()
                    .min(1)
                    .describe("MongoDB-style query (e.g. \"startsWith(name,'A*02')\" or \"equals(locus,'B')\")"),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(200)
                    .default(50)
                    .optional()
                    .describe("Max results per page (default: 50)"),
                cursor: z
                    .string()
                    .optional()
                    .describe("Pagination cursor from previous response"),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: AlleleLookupEnv })?.env;
            try {
                const params: Record<string, unknown> = {
                    query: String(args.query),
                    limit: args.limit || 50,
                };
                if (args.cursor) params.cursor = String(args.cursor);

                const response = await ipdHlaFetch("/allele", params);

                if (!response.ok) {
                    const body = await response.text().catch(() => "");
                    throw new Error(`IPD-HLA API error: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`);
                }

                const data = await response.json() as Record<string, unknown>;
                const alleles = Array.isArray(data) ? data : (data.result || data.alleles || data);

                const responseSize = JSON.stringify(alleles).length;
                if (shouldStage(responseSize) && runtimeEnv?.IPD_HLA_DATA_DO) {
                    const staged = await stageToDoAndRespond(
                        alleles,
                        runtimeEnv.IPD_HLA_DATA_DO as any,
                        "alleles",
                        undefined,
                        undefined,
                        "ipd_hla",
                        (extra as { sessionId?: string })?.sessionId,
                    );
                    return createCodeModeResponse(
                        {
                            staged: true,
                            data_access_id: staged.dataAccessId,
                            total_rows: staged.totalRows,
                            _staging: staged._staging,
                            message: `Allele data staged (${Array.isArray(alleles) ? alleles.length : '?'} alleles). Use ipd_hla_query_data with data_access_id '${staged.dataAccessId}' to query.`,
                        },
                        { meta: { staged: true, data_access_id: staged.dataAccessId } },
                    );
                }

                return createCodeModeResponse(
                    {
                        alleles: alleles,
                        total: Array.isArray(alleles) ? alleles.length : undefined,
                        cursor: typeof data === "object" && data !== null && "cursor" in data ? (data as any).cursor : undefined,
                    },
                    { meta: { fetched_at: new Date().toISOString() } },
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return createCodeModeError("API_ERROR", `ipd_hla_allele_lookup failed: ${msg}`);
            }
        },
    );
}
