/// <reference types="node" />
import { runInNewContext } from "node:vm";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { afterEach, expect, it, vi } from "vitest";
import { createIpdHlaApiFetch } from "../lib/api-adapter";
import { ipdHlaCatalog } from "./catalog";
import { releaseWorkflows } from "./releases";
afterEach(() => vi.unstubAllGlobals());

it("executes the published release workflow through the real proxy using one immutable snapshot", async () => {
  const sha = "b".repeat(40);
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("/commits/")) return Response.json({sha});
    if (url.endsWith("release_version.txt")) return new Response("# version: IPD-IMGT/HLA 3.65.0\n# date: 2026-07-14");
    if (url.endsWith("Allelelist.txt")) return new Response("AlleleID,Allele\nHLA00005,A*02:01:01:01\n");
    return new Response(">HLA:HLA00005 A*02:01:01:01 3 bp\nMAG\n");
  });
  vi.stubGlobal("fetch", fetch);
  // SAFETY: small fixture responses never invoke staging capabilities.
  const proxy = createApiProxyTool({catalog: ipdHlaCatalog, apiFetch: createIpdHlaApiFetch(), doNamespace: {} as DurableObjectNamespace, stagingPrefix: "ipd_hla"});
  // SAFETY: these small fixture responses do not access session capabilities.
  const context = {} as Parameters<typeof proxy.handler>[1];
  const api = {get: (path: string, params: Record<string, unknown>) => proxy.handler({method: "GET", path, params}, context)};
  const result = await runInNewContext(`(async()=>{${releaseWorkflows[0].code}})()`, {api});
  expect(result.allele).toMatchObject({commit: sha, release: "3.65.0", accession: "HLA00005", data: [{sequence: "MAG"}]});
  expect(fetch.mock.calls.slice(1).every(([url]) => url.includes(`/${sha}/`))).toBe(true);
});
