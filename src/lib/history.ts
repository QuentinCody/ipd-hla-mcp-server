import { archiveText } from "./archive";

const invalid = (message: string, status = 502) => Object.assign(new Error(message), { status });
export function historyAccession(params: Record<string, unknown>): string {
  if (Object.keys(params).some(key => key !== "accession") || typeof params.accession !== "string" || !/^HLA\d{1,12}$/.test(params.accession)) {
    throw invalid("Sequence history requires one exact HLA accession and no other parameters", 400);
  }
  return params.accession;
}

/** The provider's history CSV has one accession followed by numeric/NA cells. */
export function parseHistory(text: string, accession: string, release: string) {
  let source_headers = ""; let raw_header = ""; let raw_record: string | null = null;
  let source_line: number | null = null; let lineNumber = 0; let source_rows = 0;
  let columns: string[] = []; let selected: string[] | undefined;
  const seen = new Set<string>();
  // Iterate one row at a time; avoid constructing millions of cell objects.
  for (const match of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    const raw = match[0]; if (!raw) continue;
    lineNumber++;
    const line = raw.replace(/\r?\n$/, "");
    if (!columns.length && line.startsWith("#")) { source_headers += raw; continue; }
    if (!columns.length) {
      columns = line.split(","); raw_header = raw;
      if (columns[0] !== "HLA_ID" || columns.length < 2 || columns.length > 1001 ||
          columns.slice(1).some(column => !/^3\d{3}$/.test(column)) || new Set(columns).size !== columns.length) throw invalid("Unexpected IPD sequence-history header");
      continue;
    }
    const fields = line.split(",");
    if (fields.length !== columns.length || !/^HLA\d+$/.test(fields[0]) || seen.has(fields[0]) || fields.slice(1).some(value => !/^(NA|[1-9]\d*)$/.test(value))) {
      throw invalid(`Invalid IPD sequence-history record at line ${lineNumber}`);
    }
    seen.add(fields[0]); source_rows++;
    if (fields[0] === accession) { selected = fields; raw_record = raw; source_line = lineNumber; }
  }
  if (!columns.length || !source_rows || source_headers.match(/^# version: IPD-IMGT\/HLA (\S+)/m)?.[1] !== release) throw invalid("IPD sequence-history release metadata is missing or mismatched");
  return { accession, found: selected !== undefined, source_headers, source_columns: columns, raw_header, raw_record, source_line, source_rows,
    data: selected ? columns.slice(1).map((version, index) => ({ accession, release: version, sequence_version: selected![index + 1] })) : [] };
}

export async function sequenceHistory(base: string, release: string, accession: string, deadlineAt: number) {
  const source_url = `${base}/sversion_history.txt`;
  const text = await archiveText(source_url, 24_000_000, deadlineAt);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const source_text_sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  return { ...parseHistory(text, accession, release), source_url, source_text_sha256,
    interpretation: "Native sequence-version labels per release. NA is retained as provided; neither NA nor a missing history row establishes biological absence. Version numbers do not establish sequence identity or clinical compatibility." };
}
