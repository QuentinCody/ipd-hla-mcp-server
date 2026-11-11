# IPD HLA MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream IPD HLA API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

The server is deployed and ready at:

```
https://ipd-hla-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "ipd-hla": {
      "command": "npx",
      "args": ["mcp-remote", "https://ipd-hla-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8844/mcp` (start it with `./scripts/dev-servers.sh ipd-hla`):

```json
{
  "mcpServers": {
    "ipd-hla-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8844/mcp"]
    }
  }
}
```

## Tools

- `ipd_hla_search` — discover available API operations (Code Mode catalog search, 7 endpoints)
- `ipd_hla_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `ipd_hla_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `ipd_hla_get_schema` — inspect the inferred schema of a staged dataset

All four tools also register `mcp_ipd_hla_*` aliases. Complete responses over 30KB,
including composed program results and SQL pages, stage in the existing Durable
Object and return a `data_access_id` with `_staging`. Code Mode discovery,
isolated programs and in-band SQL remain available.

Every tool returns `content` and `structuredContent` with verifiable citations;
errors also set `isError`. Native archive error bodies survive staging. Use
`get_schema` before SQL: `payloads.root_json` retains the complete canonical
response, with `__CHUNKED__:` references to `content_chunks` for large payloads.

## Reproducible release lookups

The live allele API is separate from [official release archives](https://www.ebi.ac.uk/ipd/imgt/hla/release/). `/release/{ref}` accepts a release branch such as `3650`, `Latest`, or a full commit SHA. It returns the provider's release version/date and resolves branch names to immutable commits. Reuse the returned commit with `/release/{ref}/alleles`, `/release/{ref}/sequence` and `/release/{ref}/changes` so a workflow cannot silently mix snapshots. These routes are local adapters over the official ANHIG/IMGTHLA repository.

Allele lookup supports name/accession prefixes and bounded pages with `next_offset`. Exact sequence lookup accepts `allele` and `type` (`protein`, `coding`, `genomic`) and returns a `data` array with the original FASTA header and unaligned sequence. A listed allele without the requested sequence returns `found:false`; an absent allele or failed download is an error. Sequences may be partial, and protein identity does not imply noncoding identity. Preserve expression suffixes and inspect the release change report before joining names across releases.

Archive requests use unauthenticated GitHub quotas, one 30-second deadline across
commit resolution and dependent file/body reads, and a 24MB per-file read cap.
Redirects and invalid UTF-8 fail explicitly; cancellation cannot delay errors
indefinitely. Public allele lists exclude sequences confidential at release.
File URLs, release metadata and commit identity accompany results; large
lists/reports stage for SQL. See the provider's
[format documentation](https://github.com/ANHIG/IMGTHLA/blob/Latest/README.md) and
[license](https://github.com/ANHIG/IMGTHLA/blob/Latest/LICENCE.md) before redistributing data.

`/release/{ref}/sequence-history` adds an exact-accession view of the provider's
`sversion_history.txt`. It returns every release column for that accession in
native order, retaining the original numeric strings and `NA`, source headers,
selected CSV row/line, full-file text SHA-256 and resolved commit. A deleted
accession can have history despite being absent from the release allele list.
`found:false` means no row in that history file. Neither it nor `NA` establishes
biological absence, and equal version labels do not establish protein, CDS or
genomic sequence identity. Version labels need not increase monotonically.

```javascript
const release = await api.get('/release/3650');
if (release.__api_error || release.__staged) return release;
return await api.get('/release/' + release.commit + '/sequence-history', {
  accession: 'HLA00005'
});
```

October 2 validation inspected the official 3.65 history at commit
`8707b783b02cef7141db4dbf8382d9449cdab5d3`. Tests include three unmodified source
rows and synthetic size/error cases through the production staging DO. Fresh
edited-Worker acceptance remains pending local runtime/network access.

For the current REST API, set `project=HLA`. Pagination uses `next`/`prev`, extracted from the relative query strings in `meta`; preserve query/fields/project on each page. The old `cursor` argument remains a compatibility alias for `next`. Query equality is `eq`, not `equals`.

Validation on September 27, 2026 retrieved release 3.65.0 HLA00005 protein, coding and genomic sequences, staged 1,000 allele rows and 729 change rows, and counted them through SQL. The default installed Wrangler 4.69.0 runtime crashed after the initial contract probe; repeated probes and the final contract passed using the workspace's already installed Wrangler 4.85.0. This does not establish a fix to the default runtime.

## Development

```bash
./scripts/dev-servers.sh ipd-hla            # run locally (port 8844)
pnpm --filter ipd-hla-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

---

*Auto-generated baseline README — refine with server-specific detail as needed.*

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from IPD-IMGT/HLA and stays under the terms of that source: CC BY-ND; maintainers oppose mirroring; commercial users asked to fund.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
