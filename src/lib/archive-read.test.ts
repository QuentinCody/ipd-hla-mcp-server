import { afterEach, expect, it, vi } from "vitest";
import { archiveText } from "./archive";
import { releaseRequest } from "./releases";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("preserves BOM, CRLF and Unicode split across response chunks", async () => {
  const text = "\uFEFF# α🧬\r\nHLA_ID,3650\r\nHLA00005,5\r\n";
  const body = new ReadableStream({ start(controller) { for (const byte of new TextEncoder().encode(text)) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const fetcher = vi.fn(async () => new Response(body)); vi.stubGlobal("fetch", fetcher);
  expect(await archiveText("https://example.org")).toBe(text);
  expect(fetcher.mock.calls[0]).toMatchObject(["https://example.org", { redirect: "manual" }]);
});

it.each(["header", "stream"])("caps archive bytes using %s without waiting for cancellation", async mode => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); }, cancel }), { headers: mode === "header" ? { "content-length": "11" } : {} })));
  await expect(archiveText("https://example.org", 10)).rejects.toMatchObject({ status: 413 });
  expect(cancel).toHaveBeenCalledOnce();
});

it.each(["headers", "body"])("bounds stalled %s by the absolute deadline", async mode => {
  vi.useFakeTimers(); const cancel = vi.fn();
  vi.stubGlobal("fetch", vi.fn(() => mode === "headers" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ pull: () => new Promise(() => {}), cancel })))));
  const rejected = expect(archiveText("https://example.org", 100, Date.now() + 1000)).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(1001); await rejected;
  if (mode === "body") expect(cancel).toHaveBeenCalledOnce();
});

it("shares the budget across commit discovery, release metadata and history reads", async () => {
  vi.useFakeTimers(); const sha = "a".repeat(40);
  const fetcher = vi.fn((url: string) => new Promise<Response>(resolve => setTimeout(() => resolve(url.includes("commits") ? Response.json({ sha }) : new Response("# version: IPD-IMGT/HLA 3.65.0\n# date: 2026-07-14\n")), 20_000)));
  vi.stubGlobal("fetch", fetcher);
  const rejected = expect(releaseRequest("/release/3650/sequence-history", { accession: "HLA00005" })).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(30_001); await rejected;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("cancels late responses and does not start calls after an expired deadline", async () => {
  vi.useFakeTimers(); let deliver!: (response: Response) => void; const cancel = vi.fn();
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { deliver = resolve; })); vi.stubGlobal("fetch", fetcher);
  const rejected = expect(archiveText("https://example.org", 100, Date.now() + 1000)).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(1001); await rejected;
  deliver(new Response(new ReadableStream({ cancel }))); await Promise.resolve(); expect(cancel).toHaveBeenCalledOnce();
  await expect(archiveText("https://example.org", 100, Date.now() - 1)).rejects.toMatchObject({ status: 504 }); expect(fetcher).toHaveBeenCalledOnce();
});

it.each([302, 404, 429, 503])("preserves bounded HTTP %s evidence", async status => {
  const text = "native source failure α";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(text, { status })));
  await expect(archiveText("https://example.org")).rejects.toMatchObject({ status, data: text });
});

it("rejects malformed UTF-8", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0xff]))));
  await expect(archiveText("https://example.org")).rejects.toMatchObject({ status: 502 });
});

it("preserves the HTTP status of an empty error response", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  await expect(archiveText("https://example.org")).rejects.toMatchObject({ status: 404, data: "" });
});
