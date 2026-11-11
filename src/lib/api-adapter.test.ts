import { afterEach, expect, it, vi } from "vitest";
import { createIpdHlaApiFetch } from "./api-adapter";
afterEach(() => vi.unstubAllGlobals());
it("translates legacy cursor inputs while respecting explicit next tokens", async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json({data: []}));
  vi.stubGlobal("fetch", fetch);
  const api = createIpdHlaApiFetch();
  for (const params of [{cursor: "token"}, {cursor: "?limit=2&next=token"}, {cursor: "ignored", next: "token"}]) await api({method: "GET", path: "/allele", params});
  expect(fetch).toHaveBeenCalledTimes(3);
  for (const [url] of fetch.mock.calls) {
    expect(new URL(url).searchParams.get("next")).toBe("token");
    expect(new URL(url).searchParams.has("cursor")).toBe(false);
  }
});
it("keeps current API metadata and errors distinct from archive records", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({data: [], meta: {next: "?next=token", total: 12}})).mockResolvedValueOnce(new Response("Forbidden", {status: 403})).mockResolvedValueOnce(new Response("sequence text"));
  vi.stubGlobal("fetch", fetch);
  const api = createIpdHlaApiFetch();
  expect(await api({method: "GET", path: "/allele", params: {project: "HLA", next: "token"}})).toMatchObject({data: {meta: {total: 12}}});
  expect(String(fetch.mock.calls[0][0])).toContain("next=token");
  await expect(api({method: "GET", path: "/allele/HLA00005"})).rejects.toMatchObject({status: 403, data: "Forbidden"});
  expect(await api({method: "GET", path: "/allele/download"})).toMatchObject({data: "sequence text"});
  await expect(api({method: "POST", path: "/allele"})).rejects.toThrow("read-only");
});
