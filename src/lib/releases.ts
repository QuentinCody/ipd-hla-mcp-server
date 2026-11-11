import { archiveText, parseAlleles, parseChanges, resolveArchive, selectSequence } from "./archive";
import { historyAccession, sequenceHistory } from "./history";

function pageNumber(value: unknown, fallback: number, max: number) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) throw new Error(`Pagination value must be an integer from 0 to ${max}`);
  return number;
}

async function sequenceResult(base: string, alleles: ReturnType<typeof parseAlleles>, params: Record<string, unknown>, deadlineAt: number) {
  const allele = alleles.find(row => row.accession === params.allele || row.name === params.allele);
  if (!allele) throw new Error("Exact allele name/accession is absent from this release; do not silently use the current release");
  const type = String(params.type ?? "protein");
  const suffixes: Record<string, string> = {protein: "prot", coding: "nuc", genomic: "gen"};
  const suffix = suffixes[type];
  if (!Object.prototype.hasOwnProperty.call(suffixes, type)) throw new Error("type must be protein, coding or genomic");
  const locus = allele.name.split("*")[0];
  if (!/^[A-Za-z0-9-]+$/.test(locus)) throw new Error("Invalid locus in provider allele list");
  const source_url = `${base}/fasta/${locus}_${suffix}.fasta`;
  const record = selectSequence(await archiveText(source_url, 24_000_000, deadlineAt), allele.accession);
  return {...allele, type, source_url, found: record !== null, data: record ? [record] : []};
}

export async function releaseRequest(path: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const match = path.match(/^\/release\/([^/]+)(?:\/(alleles|sequence|changes|sequence-history))?$/);
  if (!match) throw new Error("Unknown IPD release operation");
  const accession = match[2] === "sequence-history" ? historyAccession(params) : undefined;
  const deadlineAt = Date.now() + 30_000;
  const archive = await resolveArchive(match[1], deadlineAt);
  const {base} = archive;
  if (!match[2]) return {...archive, files: {alleles: `${base}/Allelelist.txt`, changes: `${base}/version_report.txt`, sequence_versions: `${base}/sversion_history.txt`, license: `${base}/LICENCE.md`}};
  if (accession) return {...archive, ...await sequenceHistory(base, archive.release, accession, deadlineAt)};
  if (match[2] === "changes") return {...archive, source_url: `${base}/version_report.txt`, data: parseChanges(await archiveText(`${base}/version_report.txt`, 24_000_000, deadlineAt))};
  const source_url = `${base}/Allelelist.txt`;
  const alleles = parseAlleles(await archiveText(source_url, 24_000_000, deadlineAt));
  if (match[2] === "sequence") return {...archive, ...await sequenceResult(base, alleles, params, deadlineAt)};
  const prefix = String(params.prefix ?? "");
  const rows = alleles.filter(row => row.name.startsWith(prefix) || row.accession.startsWith(prefix));
  const offset = pageNumber(params.offset, 0, Number.MAX_SAFE_INTEGER);
  const limit = pageNumber(params.limit, 100, 1000);
  if (!limit) throw new Error("limit must be at least one");
  const data = rows.slice(offset, offset + limit);
  return {...archive, source_url, total: rows.length, offset, limit, next_offset: offset + data.length < rows.length ? offset + data.length : null, data};
}
