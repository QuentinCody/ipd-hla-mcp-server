import { afterEach, expect, it, vi } from "vitest";
import { releaseRequest } from "./releases";
import { parseHistory } from "./history";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

afterEach(() => vi.unstubAllGlobals());
const sha = "a".repeat(40);
const header = "# file: sversion_history.txt\r\n# date: 2026-07-14\r\n# version: IPD-IMGT/HLA 3.65.0\r\n";
const csv = header + "HLA_ID,3650,3640,3110,3100\r\nHLA00005,5,5,7,5\r\nHLA00022,NA,NA,1,1\r\n";

it("parses selected unmodified rows from the official 3.65 commit, including deleted-accession NA history", () => {
  // Three selected rows from blob 5c296b7a1f17ea838a001419a31dd07a9b758987
  // at ANHIG/IMGTHLA commit 8707b783b02cef7141db4dbf8382d9449cdab5d3.
  const text = readFileSync(new URL("../../test/fixtures/sequence-history-3650.txt", import.meta.url), "utf8");
  const active = parseHistory(text, "HLA00005", "3.65.0");
  expect(active.data).toHaveLength(66);
  expect(active.data.find(row => row.release === "3650")?.sequence_version).toBe("5");
  expect(active.data.find(row => row.release === "3110")?.sequence_version).toBe("7");
  expect(parseHistory(text, "HLA00022", "3.65.0").data[0].sequence_version).toBe("NA");
  expect(parseHistory(text, "HLA46988", "3.65.0").data.slice(0, 2).map(row => row.sequence_version)).toEqual(["1", "NA"]);
});
function fixture(history = csv) {
  const fetcher = vi.fn(async (url: string) => url.includes("/commits/") ? Response.json({ sha }) : url.endsWith("release_version.txt")
    ? new Response("# version: IPD-IMGT/HLA 3.65.0\n# date: 2026-07-14\n") : new Response(history));
  vi.stubGlobal("fetch", fetcher); return fetcher;
}

it("returns one accession's native sequence versions in source order without assuming monotonicity", async () => {
  const fetcher = fixture();
  const result = await releaseRequest("/release/3650/sequence-history", { accession: "HLA00005" });
  expect(result).toMatchObject({ commit: sha, release: "3.65.0", accession: "HLA00005", found: true,
    source_rows: 2, source_columns: ["HLA_ID", "3650", "3640", "3110", "3100"], source_headers: header,
    raw_header: "HLA_ID,3650,3640,3110,3100\r\n", raw_record: "HLA00005,5,5,7,5\r\n", source_line: 5,
    data: [
      { accession: "HLA00005", release: "3650", sequence_version: "5" },
      { accession: "HLA00005", release: "3640", sequence_version: "5" },
      { accession: "HLA00005", release: "3110", sequence_version: "7" },
      { accession: "HLA00005", release: "3100", sequence_version: "5" },
    ] });
  expect(result.source_text_sha256).toBe(createHash("sha256").update(csv).digest("hex"));
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "https://api.github.com/repos/ANHIG/IMGTHLA/commits/3650",
    `https://raw.githubusercontent.com/ANHIG/IMGTHLA/${sha}/release_version.txt`,
    `https://raw.githubusercontent.com/ANHIG/IMGTHLA/${sha}/sversion_history.txt`,
  ]);
});

it("keeps NA and deleted-accession history separate from an absent history row", async () => {
  const fetcher = fixture();
  const deleted = await releaseRequest(`/release/${sha}/sequence-history`, { accession: "HLA00022" });
  expect(deleted).toMatchObject({ found: true, data: [{ sequence_version: "NA" }, { sequence_version: "NA" }, { sequence_version: "1" }, { sequence_version: "1" }] });
  expect(await releaseRequest(`/release/${sha}/sequence-history`, { accession: "HLA99999" })).toMatchObject({ found: false, data: [], raw_record: null, source_line: null });
  expect(fetcher.mock.calls.every(([url]) => !url.endsWith("Allelelist.txt"))).toBe(true);
});

it.each([{}, { accession: "A*02:01" }, { accession: "HLA00005", limit: 1 }, { accession: ["HLA00005"] }])("rejects invalid or silently narrowing history requests before network access: %j", async params => {
  const fetcher = fixture();
  await expect(releaseRequest("/release/3650/sequence-history", params)).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  csv.replace("3.65.0", "3.64.0"),
  csv.replace("HLA_ID,3650", "AlleleID,3650"),
  csv.replace("3650,3640", "3650,3650"),
  csv.replace("HLA00022,NA,NA,1,1", "HLA00022,NA,NA,1"),
  csv.replace("HLA00022,NA,NA,1,1", "HLA00005,NA,NA,1,1"),
  csv.replace("HLA00022,NA,NA,1,1", "HLA00022,NA,NA,0,1"),
  csv.replace("HLA00022,NA,NA,1,1", "HLA00022,NA,,1,1"),
  csv + "junk\n",
])("rejects schema drift or malformed unselected rows rather than silently returning a partial history", async text => {
  fixture(text);
  await expect(releaseRequest(`/release/${sha}/sequence-history`, { accession: "HLA00005" })).rejects.toMatchObject({ status: 502 });
});
