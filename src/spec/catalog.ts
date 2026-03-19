import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const ipdHlaCatalog: ApiCatalog = {
    name: "IPD-IMGT/HLA Database",
    baseUrl: "https://www.ebi.ac.uk/cgi-bin/ipd/api",
    version: "3.57.0",
    auth: "none",
    endpointCount: 2,
    notes:
        "- 45,000+ HLA alleles with sequences, nomenclature, and metadata\n" +
        "- MongoDB-style query language: query=startsWith(name,'A*02')\n" +
        "- Cursor-based pagination via 'cursor' parameter from response meta.next\n" +
        "- No auth required\n" +
        "- Response shape: { data: [...alleles], meta: { next, prev, total } }\n" +
        "- Query operators: startsWith, equals, contains, endsWith, greaterThan, lessThan\n" +
        "- Fields can be filtered with 'fields' param (e.g. 'name,accession,locus')",
    endpoints: [
        {
            method: "GET",
            path: "/allele",
            summary: "Search HLA alleles with MongoDB-style query syntax. Returns paginated list of alleles.",
            category: "alleles",
            queryParams: [
                { name: "query", type: "string", required: false, description: "MongoDB-style query (e.g. \"startsWith(name,'A*02')\", \"equals(locus,'B')\")" },
                { name: "limit", type: "number", required: false, description: "Results per page (default 100)" },
                { name: "cursor", type: "string", required: false, description: "Pagination cursor from response meta.next" },
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
