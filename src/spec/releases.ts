import type { ApiEndpoint, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";

const ref = {name: "ref", type: "string" as const, required: true, description: "Official release branch (3650), Latest, or full commit SHA. Responses resolve branches to immutable commits; reuse that SHA for subsequent calls."};
export const releaseEndpoints: ApiEndpoint[] = [
  {method: "GET", path: "/release/{ref}", category: "releases", summary: "Resolve an official IPD release to immutable commit, version/date and download links. Local adapter over ANHIG/IMGTHLA; not an IPD REST endpoint.", pathParams: [ref]},
  {method: "GET", path: "/release/{ref}/alleles", category: "releases", summary: "Resolve allele accessions and names within a pinned release's public allele list. Names retain null/low/questionable expression suffixes; absence does not prove biological absence.", pathParams: [ref], queryParams: [
    {name: "prefix", type: "string", required: false, description: "Allele-name or accession prefix, e.g. A*02 or HLA00005"},
    {name: "limit", type: "number", required: false, description: "1–1000, default 100"},
    {name: "offset", type: "number", required: false, description: "Zero-based offset; continue using next_offset and the returned commit"},
  ]},
  {method: "GET", path: "/release/{ref}/sequence", category: "releases", summary: "Retrieve an exact allele's protein, coding or genomic FASTA record from the pinned official release. Reads a locus file (24MB cap); missing sequences return found:false, HTTP errors remain errors. Does not substitute a modern allele or infer full-length coverage.", pathParams: [ref], queryParams: [
    {name: "allele", type: "string", required: true, description: "Exact name or accession from the release allele list, e.g. HLA00005"},
    {name: "type", type: "string", required: false, enum: ["protein", "coding", "genomic"], description: "Default protein. FASTA is unaligned and may be partial; preserve original header and sequence."},
  ]},
  {method: "GET", path: "/release/{ref}/changes", category: "releases", summary: "Read the pinned release's CSV change report as rows retaining original status, accession and comments, plus version/date/commit provenance. Large reports stage for SQL; source_url links the original file.", pathParams: [ref]},
  {method: "GET", path: "/release/{ref}/sequence-history", category: "releases", featured: true,
    summary: "Get one exact accession's native sequence-version labels across releases in a commit-pinned official history file. Local archive adapter, not a new IPD REST endpoint.", pathParams: [ref],
    queryParams: [{ name: "accession", type: "string", required: true, description: "Exact HLA accession, e.g. HLA00005. Accepts deleted-accession history without requiring membership in the current allele list." }],
    description: "Returns all release columns for one accession in native order, including NA and non-monotonic version labels. Keeps source headers, exact selected CSV record/line, full-file text SHA-256 and immutable commit. found:false means no matching history row; NA is not biological absence. Equal labels do not establish protein/CDS/genomic sequence identity or clinical compatibility.",
    example: 'return await api.get("/release/{ref}/sequence-history", { ref: "3650", accession: "HLA00005" });',
  },
];

export const releaseWorkflows: WorkflowRecipe[] = [{
  title: "Resolve an HLA allele and its sequence in release 3.65",
  description: "Pin all dependent calls to the commit returned by release discovery. Compare archive data with the live API only as explicitly different snapshots.",
  keywords: ["release", "sequence", "2026", "3.65", "allele", "reproducibility"],
  code: 'const release = await api.get("/release/{ref}", {ref: "3650"}); if (release.__api_error || release.__staged) return release; const allele = await api.get("/release/{ref}/sequence", {ref: release.commit, allele: "HLA00005", type: "protein"}); if (allele.__api_error || allele.__staged) return allele; return {release, allele};',
}, {
  title: "Inspect HLA sequence-version history in one pinned snapshot",
  description: "Resolve the release once and retain the full native history, including NA and unusual version transitions. Use exact archived FASTA reads for any sequence comparison.",
  keywords: ["sequence history", "accession", "deleted", "version", "NA", "release"],
  code: 'const release = await api.get("/release/{ref}", { ref: "3650" }); if (release.__api_error || release.__staged) return release; const history = await api.get("/release/{ref}/sequence-history", { ref: release.commit, accession: "HLA00005" }); if (history.__api_error || history.__staged) return history; return { release, history };',
}];
