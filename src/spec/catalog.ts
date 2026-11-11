import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { releaseEndpoints, releaseWorkflows } from "./releases";

export const ipdHlaCatalog: ApiCatalog = {
    name: "IPD-IMGT/HLA Database",
    baseUrl: "https://www.ebi.ac.uk/cgi-bin/ipd/api",
    version: "live",
    auth: "none",
    endpointCount: 2 + releaseEndpoints.length,
    notes:
        "- Live allele API and separately pinned official release archives; live results are not automatically the July 2026 3.65 release.\n" +
        "- MongoDB-style query language: query=startsWith(name,'A*02')\n" +
        "- Pagination uses next/prev tokens; meta.next is a relative query string. Extract its next value; preserve project/query/fields when continuing.\n" +
        "- No auth required\n" +
        "- Response shape: { data: [...alleles], meta: { next, prev, total } }\n" +
        "- Query operators: startsWith, eq, contains, endsWith, gt, lt, and, or. Set project=HLA to avoid mixing IPD projects.\n" +
        "- Fields can be filtered with 'fields' param (e.g. 'name,accession,locus'). Retain release/sequence history from full records.\n" +
        "- Archive ref 3650 selects release 3.65; reuse returned commit for reproducibility. Public lists omit sequences confidential at release. Protein/CDS identities do not imply identical noncoding sequences.\n" +
        "- Archive reads use unauthenticated GitHub quotas, a 24MB file cap and one 30-second deadline per release operation. Sequence history preserves native NA/version labels and does not infer biological absence or sequence identity. Download links and source headers are retained. Provider terms: https://github.com/ANHIG/IMGTHLA/blob/Latest/LICENCE.md",
    workflows: releaseWorkflows,
    endpoints: [
        ...releaseEndpoints,
        {
            method: "GET",
            path: "/allele",
            summary: "Search HLA alleles with MongoDB-style query syntax. Returns paginated list of alleles.",
            category: "alleles",
            queryParams: [
                { name: "query", type: "string", required: false, description: "MongoDB-style query (e.g. \"startsWith(name,'A*02')\", \"eq(locus,'B')\")" },
                { name: "limit", type: "number", required: false, description: "Results per page (default 100)" },
                { name: "next", type: "string", required: false, description: "Next token extracted from response meta.next query string" },
                { name: "cursor", type: "string", required: false, description: "Compatibility alias for next; accepts the token or old meta.next relative query string" },
                { name: "prev", type: "string", required: false, description: "Previous token extracted from response meta.prev query string" },
                { name: "project", type: "string", required: false, description: "Use HLA for human HLA alleles" },
                { name: "fields", type: "string", required: false, description: "Comma-separated list of fields to include (e.g. 'name,accession,locus')" },
            ],
        },
        {
            method: "GET",
            path: "/allele/{id}",
            summary: "Get full allele details by accession ID including sequence, features, citations, and cross-references",
            category: "alleles",
            pathParams: [
                { name: "id", type: "string", required: true, description: "Allele accession (e.g. 'HLA00005' for A*02:01:01:01)" },
            ],
        },
    ],
};
