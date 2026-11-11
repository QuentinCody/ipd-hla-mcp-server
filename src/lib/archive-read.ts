const failure = (message: string, status: number, data?: unknown) => Object.assign(new Error(message), { status, data });

/** Preserve valid UTF-8 bytes, with one deadline covering headers and body. */
export async function readArchiveText(url: string, maxBytes: number, deadlineAt: number): Promise<string> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw failure("IPD archive request deadline exceeded", 504);
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(failure("IPD archive request deadline exceeded", 504)); }, remaining);
  });
  try {
    const request = fetch(url, { redirect: "manual", headers: { Accept: "application/vnd.github+json", "User-Agent": "bio-mcp-ipd-hla" }, signal: AbortSignal.timeout(remaining) }).then(response => {
      if (expired) { void response.body?.cancel().catch(() => undefined); throw failure("IPD archive request deadline exceeded", 504); }
      return response;
    });
    const response = await Promise.race([request, deadline]);
    reader = response.body?.getReader();
    if (!reader) throw failure(response.ok ? "IPD archive has no response body" : `IPD archive HTTP ${response.status}: ${url}`, response.ok ? 502 : response.status, "");
    if (Number(response.headers.get("content-length")) > maxBytes) throw failure("IPD archive exceeds read budget; use the provider download outside Code Mode", 413);
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    let text = ""; let bytes = 0;
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw failure("IPD archive exceeds read budget; use the provider download outside Code Mode", 413);
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    if (!response.ok) throw failure(`IPD archive HTTP ${response.status}: ${url}`, response.status, text);
    return text;
  } catch (error) {
    if (expired) throw failure("IPD archive request deadline exceeded", 504);
    if (error instanceof Error && "status" in error) throw error;
    throw failure("IPD archive unavailable or invalid UTF-8", 502);
  } finally {
    clearTimeout(timer);
    void reader?.cancel().catch(() => undefined); reader?.releaseLock();
  }
}
