import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, "..");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

let total = 0;
let passed = 0;
let failed = 0;

function assert(condition, message) {
    total++;
    if (condition) {
        passed++;
        console.log(`  ${GREEN}✓${RESET} ${message}`);
    } else {
        failed++;
        console.log(`  ${RED}✗${RESET} ${message}`);
    }
}

function readSrc(relPath) {
    return readFileSync(join(serverDir, relPath), "utf-8");
}

console.log(`\n${BLUE}IPD-HLA MCP Server — Structured Content Regression${RESET}\n`);

// Allele lookup tool
const alleleLookup = readSrc("src/tools/allele-lookup.ts");
assert(alleleLookup.includes("createCodeModeResponse"), "allele-lookup.ts includes createCodeModeResponse");
assert(alleleLookup.includes("createCodeModeError"), "allele-lookup.ts includes createCodeModeError");

// Allele detail tool
const alleleDetail = readSrc("src/tools/allele-detail.ts");
assert(alleleDetail.includes("createCodeModeResponse"), "allele-detail.ts includes createCodeModeResponse");
assert(alleleDetail.includes("createCodeModeError"), "allele-detail.ts includes createCodeModeError");

// Index exports
const index = readSrc("src/index.ts");
assert(index.includes("IpdHlaDataDO"), "index.ts exports IpdHlaDataDO");
assert(index.includes("McpAgent"), "index.ts uses McpAgent");

console.log(`\n  Total: ${total} | ${GREEN}Passed: ${passed}${RESET} | ${failed > 0 ? RED : ""}Failed: ${failed}${RESET}\n`);

if (failed > 0) process.exit(1);
