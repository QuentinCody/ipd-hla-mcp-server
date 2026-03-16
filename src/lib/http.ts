import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const IPD_HLA_BASE = "https://www.ebi.ac.uk/cgi-bin/ipd/api";

export interface IpdHlaFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the IPD-IMGT/HLA API.
 */
export async function ipdHlaFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: IpdHlaFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? IPD_HLA_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "ipd-hla-mcp-server/1.0 (bio-mcp)",
    });
}
