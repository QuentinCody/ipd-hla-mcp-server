import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { hashCanonicalJson, verifyCitationEnvelope } from "@bio-mcp/shared";
import { DynamicWorkerExecutor } from "@bio-mcp/shared/codemode/execute-tool";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { IpdHlaDataDO } from "../do";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";
import { releaseWorkflows } from "../spec/releases";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function createStore() {
  const database = new DatabaseSync(":memory:");
  let ready = Promise.resolve();
  const exec = (query: string, ...values: any[]) => {
    const rows = database.prepare(query).all(...values);
    const iterator = rows[Symbol.iterator]();
    return { toArray: () => rows, one: () => rows[0], next: () => iterator.next(), [Symbol.iterator]: () => iterator };
  };
  const transactionSync = <T>(run: () => T): T => {
    database.exec("BEGIN");
    try { const result = run(); database.exec("COMMIT"); return result; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  const ctx = { blockConcurrencyWhile: (run: () => Promise<void>) => { ready = run(); return ready; }, storage: { sql: { exec }, transactionSync } };
  const instance = new IpdHlaDataDO(ctx as unknown as DurableObjectState, {} as Cloudflare.Env);
  return { database, instance, ready };
}

function fixture() {
  // Exercise generated API helpers and user code; replace only the platform isolate.
  vi.spyOn(DynamicWorkerExecutor.prototype, "execute").mockImplementation(async (code, functions) => {
    const staged: Array<Record<string, unknown>> = [];
    try {
      const run = new Function("codemode", "__stagedResults", "console", `return (${code})();`);
      const result = await run(functions, staged, { warn() {}, log() {} });
      return { result: JSON.parse(JSON.stringify(result)), __stagedResults: staged };
    } catch (error) { return { error: String((error as Error).message), __stagedResults: staged }; }
  });
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const namespace = { idFromName: (name: string) => name, get: (id: string) => ({ fetch: async (request: Request) => {
    let store = stores.get(id);
    if (!store) { store = createStore(); stores.set(id, store); }
    await store.ready;
    return store.instance.fetch(request);
  } }) };
  const env = { IPD_HLA_DATA_DO: namespace, CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1];
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, env); registerQueryData(server, env); registerGetSchema(server, env);
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<any> }> })._registeredTools;
  return { tools, close: () => { for (const store of stores.values()) store.database.close(); } };
}

async function recover(f: ReturnType<typeof fixture>, id: string, prefix: string) {
  const rows = async (sql: string) => {
    const output = await f.tools[`${prefix}ipd_hla_query_data`].handler({ data_access_id: id, sql }, {});
    expect(output.isError, JSON.stringify(output)).not.toBe(true);
    expect(output.structuredContent.staged).not.toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThan(30720);
    return output.structuredContent.data.rows;
  };
  const text = async (table: string, column: string, where: string) => {
    const [{ n }] = await rows(`SELECT length(${column}) AS n FROM ${table} WHERE ${where}`);
    let result = "";
    for (let start = 1; start <= n; start += 1000) {
      const [row] = await rows(`SELECT substr(${column}, ${start}, 1000) AS part FROM ${table} WHERE ${where}`);
      result += row.part;
    }
    return result;
  };
  let raw = await text("payloads", "root_json", "id = 1");
  if (raw.startsWith("__CHUNKED__:")) {
    const chunk = raw.slice("__CHUNKED__:".length);
    expect(chunk).toMatch(/^chunk_[a-f0-9]{32}$/);
    const parts = await rows(`SELECT chunk_index FROM content_chunks WHERE content_id = '${chunk}' ORDER BY chunk_index`);
    raw = "";
    for (const part of parts) raw += await text("content_chunks", "chunk_data", `content_id = '${chunk}' AND chunk_index = ${part.chunk_index}`);
  }
  const decoded = JSON.parse(raw);
  return typeof decoded === "string" ? JSON.parse(decoded) : decoded;
}

const sha = "a".repeat(40);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const idOf = (result: any) => result.structuredContent.data_access_id ?? result.structuredContent.data?.data_access_id;
function upstream(large = false, fail = false) {
  // Stress a long history without downloading or inventing a current release.
  const versions = large ? Array.from({ length: 1000 }, (_, i) => String(3999 - i)) : ["3650", "3640", "3110"];
  const text = `# version: IPD-IMGT/HLA 3.65.0\n# date: 2026-07-14\nHLA_ID,${versions.join(",")}\nHLA00005,${versions.map((_, i) => i % 2 ? "NA" : "5").join(",")}\n`;
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes("/commits/")) return Response.json({ sha });
    if (url.endsWith("release_version.txt")) return new Response("# version: IPD-IMGT/HLA 3.65.0\n# date: 2026-07-14\n");
    return new Response(fail ? "native error α|🧬".repeat(6000) : text, { status: fail ? 404 : 200 });
  });
  vi.stubGlobal("fetch", fetcher); return { text, versions, fetcher };
}

it("discovers history and executes a commit-pinned lookup through both aliases", async () => {
  const f = fixture(); const { fetcher } = upstream();
  const code = ` \nreturn await api.get('/release/${sha}/sequence-history', { accession: 'HLA00005' });\r\n`;
  try {
    for (const prefix of ["", "mcp_"]) {
      for (const tool of ["search", "execute", "query_data", "get_schema"]) expect(f.tools[`${prefix}ipd_hla_${tool}`]).toBeDefined();
      const search = await f.tools[`${prefix}ipd_hla_search`].handler({ query: "sequence history", max_results: 5 }, {});
      expect(JSON.stringify(search)).toContain("sequence-history");
      const result = await f.tools[`${prefix}ipd_hla_execute`].handler({ code }, {});
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      expect(result.structuredContent.data).toMatchObject({ commit: sha, found: true, data: [{ sequence_version: "5" }, { sequence_version: "NA" }, { sequence_version: "5" }] });
      const verification = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: { code } });
      expect(verification.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
    expect(fetcher.mock.calls.every(([url]) => url.includes(`/${sha}/`))).toBe(true);
  } finally { f.close(); }
});

it("runs the published discovery-to-history recipe with one resolved commit", async () => {
  const f = fixture(); const { fetcher } = upstream();
  try {
    const code = releaseWorkflows[1].code;
    const result = await f.tools.ipd_hla_execute.handler({ code }, {});
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(result.structuredContent.data).toMatchObject({ release: { commit: sha }, history: { commit: sha, found: true, data: expect.any(Array) } });
    expect(fetcher.mock.calls.filter(([url]) => url.includes("/commits/"))).toHaveLength(1);
    expect(fetcher.mock.calls.slice(1).every(([url]) => url.includes(`/${sha}/`))).toBe(true);
  } finally { f.close(); }
});

it.each(releaseWorkflows)("preserves native errors from the published $title workflow", async workflow => {
  const f = fixture(); upstream(false, true);
  try {
    const result = await f.tools.ipd_hla_execute.handler({ code: workflow.code }, {});
    expect(result).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: { success: false } });
    expect(await recover(f, result.structuredContent.data.data.data_access_id, "")).toBe("native error α|🧬".repeat(6000));
  } finally { f.close(); }
});

it("recovers native history and exact hashes through production staged SQL on both aliases", async () => {
  const f = fixture(); const { text, versions } = upstream(true);
  const code = `return await api.get('/release/${sha}/sequence-history', { accession: 'HLA00005' });`;
  try {
    for (const prefix of ["", "mcp_"]) {
      const result = await f.tools[`${prefix}ipd_hla_execute`].handler({ code }, {});
      expect(result.isError, JSON.stringify(result)).not.toBe(true); expect(bytes(result)).toBeLessThan(30720);
      expect(result.structuredContent._staging).toBeDefined(); const id = idOf(result);
      const recovered = await recover(f, id, prefix);
      expect(recovered.raw_record).toBe(text.split("\n")[3] + "\n"); expect(recovered.source_columns).toEqual(["HLA_ID", ...versions]);
      expect(recovered.data).toHaveLength(1000);
      expect(result.structuredContent._meta.citation.result_hash).toBe(await hashCanonicalJson(recovered));
      const verified = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: { code }, materialized: { value: recovered } });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
      const query = await f.tools[`${prefix}ipd_hla_query_data`].handler({ data_access_id: id, sql: "SELECT sequence_version, count(*) AS n FROM data GROUP BY sequence_version ORDER BY sequence_version" }, {});
      expect(query.structuredContent.data.rows).toEqual([{ sequence_version: "5", n: 500 }, { sequence_version: "NA", n: 500 }]);
      const schema = await f.tools[`${prefix}ipd_hla_get_schema`].handler({ data_access_id: id }, {});
      expect(schema).toMatchObject({ content: expect.any(Array), structuredContent: { success: true, _meta: { citation: { result_hash: expect.any(String) } } } });
    }
  } finally { f.close(); }
});

it("retains staged native archive errors", async () => {
  const f = fixture(); upstream(false, true); const code = `return await api.get('/release/${sha}/sequence-history', { accession: 'HLA00005' });`;
  try {
    for (const prefix of ["", "mcp_"]) {
      const result = await f.tools[`${prefix}ipd_hla_execute`].handler({ code }, {});
      expect(result).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: { success: false } }); expect(bytes(result)).toBeLessThan(30720);
      expect(await recover(f, result.structuredContent.data.data.data_access_id, prefix)).toBe("native error α|🧬".repeat(6000));
    }
  } finally { f.close(); }
});

it("stages composed program results and large SQL pages with verifiable citations", async () => {
  const f = fixture(); upstream(true);
  try {
    for (const prefix of ["", "mcp_"]) {
      const code = `return { evidence: '"'.repeat(15500) };`;
      const result = await f.tools[`${prefix}ipd_hla_execute`].handler({ code }, {});
      expect(bytes(result)).toBeLessThan(30720);
      const recovered = await recover(f, idOf(result), prefix);
      expect(recovered.structuredContent.data.evidence).toBe('"'.repeat(15500));
      const verified = await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent, toolArguments: { code }, materialized: { value: recovered } });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
      const history = await f.tools[`${prefix}ipd_hla_execute`].handler({ code: `return await api.get('/release/${sha}/sequence-history', { accession: 'HLA00005' });` }, {});
      const args = { data_access_id: idOf(history), sql: "SELECT * FROM data ORDER BY release LIMIT 1000", limit: 1000 };
      const query = await f.tools[`${prefix}ipd_hla_query_data`].handler(args, {});
      expect(query.isError, JSON.stringify(query)).not.toBe(true); expect(bytes(query)).toBeLessThan(30720);
      const materialized = await recover(f, idOf(query), prefix);
      expect(materialized.structuredContent.data.rows).toHaveLength(1000);
      const queryVerified = await verifyCitationEnvelope({ citation: query.structuredContent._meta.citation, structuredContent: query.structuredContent, toolArguments: args, materialized: { value: materialized } });
      expect(queryVerified.verification).toMatchObject({ query: "verified", result: "verified", quarantined: false });
    }
  } finally { f.close(); }
});
