import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { ipdHlaFetch } from "./http";
import { releaseRequest } from "./releases";

export function createIpdHlaApiFetch(): ApiFetchFn {
    return async (request) => {
        if (request.method !== "GET" || request.body !== undefined) throw Object.assign(new Error("IPD-HLA exposes read-only GET operations without a body"), {status: 405});
        if (request.path.startsWith("/release/")) return {status: 200, data: await releaseRequest(request.path, request.params)};
        const params = {...request.params};
        // Preserve the old catalog's cursor argument as an alias for the real next token.
        if (params.cursor !== undefined) {
            params.next ??= String(params.cursor).startsWith("?") ? new URLSearchParams(String(params.cursor).slice(1)).get("next") : params.cursor;
            delete params.cursor;
        }
        const response = await ipdHlaFetch(request.path, params);

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
