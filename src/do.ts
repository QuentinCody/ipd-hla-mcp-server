import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class IpdHlaDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        if (Array.isArray(data)) {
            const sample = data[0];
            if (sample && typeof sample === "object") {
                if ("name" in sample && ("locus" in sample || "allele_group" in sample)) {
                    return {
                        tableName: "alleles",
                        indexes: ["name", "locus", "allele_group"],
                    };
                }
            }
        }

        return undefined;
    }
}
