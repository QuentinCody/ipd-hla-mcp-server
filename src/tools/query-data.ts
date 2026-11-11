// interlinked-tdd: exempt
import type { McpServer } from "@bio-mcp/shared/mcp";
import { ipdHlaResponse } from "../lib/tool-result";
import { z } from "zod";
import { createQueryDataHandler } from "@bio-mcp/shared/staging/utils";

interface QueryEnv {
	IPD_HLA_DATA_DO?: unknown;
}

const MAX_LIMIT = 10000;
const DEFAULT_LIMIT = 100;

export function registerQueryData(server: McpServer, env?: QueryEnv): void {
	const handler = createQueryDataHandler("IPD_HLA_DATA_DO", "ipd_hla");

	for (const name of ["ipd_hla_query_data", "mcp_ipd_hla_query_data"]) server.registerTool(
		name,
		{
			title: "Query Staged IPD-IMGT/HLA Data",
			description:
				"Query staged IPD-IMGT/HLA allele and sequence data using SQL. Use this when responses are too large and have been staged with a data_access_id.",
			inputSchema: {
				data_access_id: z.string().min(1).describe("Data access ID for the staged dataset"),
				sql: z.string().min(1).describe("SQL query to execute against the staged data"),
				limit: z
					.number()
					.int()
					.positive()
					.max(MAX_LIMIT)
					.default(DEFAULT_LIMIT)
					.optional()
					.describe(`Maximum number of rows to return (default: ${DEFAULT_LIMIT})`),
			},
		},
		async (args, extra) => {
			const runtimeEnv = env || (extra as { env?: QueryEnv })?.env || {};
			return ipdHlaResponse(() => handler(args as Record<string, unknown>, runtimeEnv as Record<string, unknown>), runtimeEnv, name, extra, args);
		},
	);
}
