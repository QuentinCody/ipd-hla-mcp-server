import { afterEach, expect, it, vi } from "vitest";
import { archiveText, parseAlleles, parseChanges, resolveArchive, selectSequence } from "./archive";
afterEach(() => vi.unstubAllGlobals());
it("preserves quoted change comments and rejects unexpected document shapes", () => {
  expect(parseChanges('# version: fixture\nStatus,Alleles,AlleleID,Comments\nDeleted,A*01,HLA00001,"Renamed, see A*02"\n')).toEqual([{Status: "Deleted", Alleles: "A*01", AlleleID: "HLA00001", Comments: "Renamed, see A*02"}]);
  expect(() => parseChanges("<html>Access denied</html>")).toThrow("schema");
});

it("preserves accession, null-expression suffixes and first/subsequent FASTA records", () => {
  expect(parseAlleles("# version: fixture\nAlleleID,Allele\nHLA00001,A*01:01N\n")).toEqual([{accession: "HLA00001", name: "A*01:01N"}]);
  const fasta = ">HLA:HLA00001 A*01:01N 3 bp\nMA\nX\n>HLA:HLA00005 A*02:01 2 bp\nAC\n";
  expect(selectSequence(fasta, "HLA00001")?.sequence).toBe("MAX");
  expect(selectSequence(fasta, "HLA00005")?.sequence).toBe("AC");
  expect(selectSequence(fasta, "HLA99999")).toBeNull();
  expect(() => selectSequence("version https://git-lfs.github.com/spec/v1", "HLA00001")).toThrow("FASTA");
  for (const text of ["bad header", "AlleleID,Allele\nbad,A*01", "AlleleID,Allele\nHLA1,A*01,extra"]) expect(() => parseAlleles(text)).toThrow();
});

it("rejects HTTP failures, missing body, oversize payload and invalid archive identifiers", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("no", {status: 404})).mockResolvedValueOnce(new Response(null)).mockResolvedValueOnce(new Response("abcd")));
  await expect(archiveText("https://example.org")).rejects.toThrow("404");
  await expect(archiveText("https://example.org")).rejects.toThrow("body");
  await expect(archiveText("https://example.org", 3)).rejects.toThrow("budget");
  await expect(resolveArchive("../Latest")).rejects.toThrow("ref must");
});

it("validates upstream commit and release metadata", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({sha: "bad"})).mockResolvedValueOnce(new Response("invalid metadata")));
  await expect(resolveArchive("3650")).rejects.toThrow("commit SHA");
  await expect(resolveArchive("a".repeat(40))).rejects.toThrow("metadata");
});
