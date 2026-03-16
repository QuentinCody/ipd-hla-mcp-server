import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const ipdHlaCatalog: ApiCatalog = {
    name: "IPD-IMGT/HLA Database",
    baseUrl: "https://www.ebi.ac.uk/cgi-bin/ipd/api",
    version: "3.57.0",
    auth: "none",
    endpointCount: 10,
    notes:
        "- 45,000+ HLA alleles with sequences, nomenclature, and metadata\n" +
        "- MongoDB-style query language: query=startsWith(name,'A*02')\n" +
        "- Cursor-based pagination via 'cursor' parameter\n" +
        "- No auth required\n" +
        "- For allele search, prefer the ipd_hla_allele_lookup hand-built tool\n" +
        "- For allele details, prefer the ipd_hla_allele_detail hand-built tool",
    endpoints: [
        // Alleles
        {
            method: "GET",
            path: "/allele",
            summary: "Search HLA alleles with MongoDB-style query syntax. Returns paginated list of alleles.",
            category: "alleles",
            coveredByTool: "ipd_hla_allele_lookup",
            queryParams: [
                { name: "query", type: "string", required: false, description: "MongoDB-style query (e.g. startsWith(name,'A*02'), equals(locus,'B'))" },
                { name: "limit", type: "number", required: false, description: "Results per page (default 100)" },
                { name: "cursor", type: "string", required: false, description: "Pagination cursor from previous response" },
                { name: "fields", type: "string", required: false, description: "Comma-separated list of fields to include" },
            ],
        },
        {
            method: "GET",
            path: "/allele/{id}",
            summary: "Get full allele details by ID including sequence, features, and cross-references",
            category: "alleles",
            coveredByTool: "ipd_hla_allele_detail",
            pathParams: [
                { name: "id", type: "string", required: true, description: "Allele ID (e.g. HLA00001)" },
            ],
        },
        // Loci
        {
            method: "GET",
            path: "/locus",
            summary: "List all HLA loci (A, B, C, DRB1, DQB1, etc.)",
            category: "loci",
        },
        {
            method: "GET",
            path: "/locus/{name}",
            summary: "Get details for a specific HLA locus",
            category: "loci",
            pathParams: [
                { name: "name", type: "string", required: true, description: "Locus name (e.g. A, B, C, DRB1)" },
            ],
        },
        // Genes
        {
            method: "GET",
            path: "/gene",
            summary: "List all HLA genes",
            category: "genes",
        },
        {
            method: "GET",
            path: "/gene/{name}",
            summary: "Get details for a specific HLA gene",
            category: "genes",
            pathParams: [
                { name: "name", type: "string", required: true, description: "Gene name (e.g. HLA-A, HLA-B)" },
            ],
        },
        // Populations
        {
            method: "GET",
            path: "/population",
            summary: "List HLA allele frequency populations",
            category: "populations",
        },
        // Allele groups
        {
            method: "GET",
            path: "/allele_group",
            summary: "List allele groups",
            category: "allele_groups",
            queryParams: [
                { name: "query", type: "string", required: false, description: "MongoDB-style query filter" },
                { name: "limit", type: "number", required: false, description: "Results per page" },
            ],
        },
        // Statistics
        {
            method: "GET",
            path: "/stats",
            summary: "Get database statistics (total alleles, loci counts, release info)",
            category: "statistics",
        },
        // Search
        {
            method: "GET",
            path: "/search",
            summary: "Full-text search across alleles, genes, and loci",
            category: "search",
            queryParams: [
                { name: "q", type: "string", required: true, description: "Search query" },
                { name: "limit", type: "number", required: false, description: "Max results" },
            ],
        },
    ],
};
