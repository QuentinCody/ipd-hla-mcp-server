import { parseCsvAsStrings } from "@bio-mcp/shared/staging/csv-parser";
import { readArchiveText } from "./archive-read";

const REPOSITORY = "https://api.github.com/repos/ANHIG/IMGTHLA";
const RAW = "https://raw.githubusercontent.com/ANHIG/IMGTHLA";

export function archiveText(url: string, maxBytes = 24_000_000, deadlineAt = Date.now() + 30_000): Promise<string> {
  return readArchiveText(url, maxBytes, deadlineAt);
}

export async function resolveArchive(ref: string, deadlineAt = Date.now() + 30_000): Promise<{requested_ref: string; commit: string; release: string; date: string; base: string; metadata: string}> {
  if (!/^(Latest|3\d{3}|[a-f0-9]{40})$/.test(ref)) throw new Error("ref must be Latest, a release branch such as 3650, or a full commit SHA");
  const commit = /^[a-f0-9]{40}$/.test(ref) ? ref : JSON.parse(await archiveText(`${REPOSITORY}/commits/${ref}`, 24_000_000, deadlineAt)).sha;
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("IPD archive did not return a commit SHA");
  const base = `${RAW}/${commit}`;
  const metadata = await archiveText(`${base}/release_version.txt`, 24_000_000, deadlineAt);
  const release = metadata.match(/^# version: IPD-IMGT\/HLA (\S+)/m)?.[1];
  const date = metadata.match(/^# date: (\S+)/m)?.[1];
  if (!release || !date) throw new Error("IPD release metadata is missing version/date");
  return {requested_ref: ref, commit, release, date, base, metadata};
}

export function parseAlleles(text: string): {accession: string; name: string}[] {
  const lines = text.split(/\r?\n/).filter(line => line && !line.startsWith("#"));
  if (lines.shift() !== "AlleleID,Allele") throw new Error("Unexpected IPD allele-list schema");
  return lines.map(line => {
    const [accession, name, extra] = line.split(",");
    if (!/^HLA\d+$/.test(accession) || !name?.includes("*") || extra !== undefined) throw new Error("Invalid IPD allele-list row");
    return {accession, name};
  });
}

export function selectSequence(text: string, accession: string): {header: string; sequence: string} | null {
  if (!text.startsWith(">HLA:")) throw new Error("Unexpected IPD FASTA format (possibly a Git LFS pointer)");
  const record = text.split(/(?:^|\n)>/).find(entry => entry.startsWith(`HLA:${accession} `));
  if (!record) return null;
  const [header, ...lines] = record.trim().split(/\r?\n/);
  return {header, sequence: lines.join("")};
}

export function parseChanges(text: string): Record<string, string>[] {
  const csv = text.replace(/^(?:#[^\n]*\r?\n)+/, "");
  if (!csv.startsWith("Status,Alleles,AlleleID,Comments")) throw new Error("Unexpected IPD change-report schema");
  return parseCsvAsStrings(csv);
}
