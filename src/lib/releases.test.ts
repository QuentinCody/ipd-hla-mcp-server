import { afterEach, expect, it, vi } from "vitest";
import { releaseRequest } from "./releases";
afterEach(() => vi.unstubAllGlobals());
const sha = "a".repeat(40);
function fixture() {
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("/commits/")) return Response.json({sha});
    if (url.endsWith("release_version.txt")) return new Response("# date: 2026-07-14\n# version: IPD-IMGT/HLA 3.65.0");
    if (url.endsWith("Allelelist.txt")) return new Response("AlleleID,Allele\nHLA00001,A*01:01N\nHLA00005,A*02:01\nHLA00006,A*03:01\n");
    if (url.endsWith("version_report.txt")) return new Response("Status,Alleles,AlleleID,Comments\nNew,A*03:01,HLA00006,\n");
    return new Response(">HLA:HLA00001 A*01:01N 3 bp\nMAX\n>HLA:HLA00005 A*02:01 2 bp\nAC\n");
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

it("resolves release branches once then pins files and pagination to the returned commit", async () => {
  const fetch = fixture();
  const first = await releaseRequest("/release/3650/alleles", {prefix: "A*", limit: 1});
  expect(first).toMatchObject({release: "3.65.0", commit: sha, date: "2026-07-14", total: 3, next_offset: 1, data: [{accession: "HLA00001", name: "A*01:01N"}]});
  const second = await releaseRequest(`/release/${sha}/alleles`, {offset: 1, limit: 2});
  expect(second).toMatchObject({next_offset: null, data: [{accession: "HLA00005", name: "A*02:01"}, {accession: "HLA00006", name: "A*03:01"}]});
  expect(fetch.mock.calls.filter(([url]) => url.includes("/commits/")).length).toBe(1);
  expect(fetch.mock.calls.slice(1).every(([url]) => url.includes(`/${sha}/`))).toBe(true);
});

it("retrieves pinned exact sequences, release manifest and change report without substituting current data", async () => {
  fixture();
  expect(await releaseRequest("/release/Latest")).toMatchObject({commit: sha, files: {changes: `https://raw.githubusercontent.com/ANHIG/IMGTHLA/${sha}/version_report.txt`}});
  expect(await releaseRequest("/release/3650/changes")).toMatchObject({data: [{Status: "New", Alleles: "A*03:01", AlleleID: "HLA00006", Comments: ""}]});
  for (const type of ["protein", "coding", "genomic"]) expect(await releaseRequest("/release/3650/sequence", {allele: "A*01:01N", type})).toMatchObject({found: true, data: [{sequence: "MAX"}], type});
  expect(await releaseRequest("/release/3650/sequence", {allele: "HLA00006"})).toMatchObject({found: false, data: []});
  await expect(releaseRequest("/release/3650/sequence", {allele: "HLA99999"})).rejects.toThrow("absent");
  await expect(releaseRequest("/release/3650/sequence", {allele: "HLA00001", type: "other"})).rejects.toThrow("type");
  for (const params of [{limit: 0}, {limit: 1001}, {offset: -1}, {offset: 1.2}]) await expect(releaseRequest("/release/3650/alleles", params)).rejects.toThrow();
  await expect(releaseRequest("/release/3650/unknown")).rejects.toThrow("Unknown");
});
