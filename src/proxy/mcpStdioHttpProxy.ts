import { Buffer } from "node:buffer";

const targetUrl = process.env.MCP_HTTP_URL ?? "http://localhost:3000/mcp";
const requestTimeoutMs = Number.parseInt(process.env.MCP_PROXY_TIMEOUT_MS ?? "30000", 10);
const forceContentLength = process.env.MCP_STDIO_USE_CONTENT_LENGTH === "true";

const writeMessage = (payload: unknown): void => {
  const json = JSON.stringify(payload);

  if (forceContentLength) {
    const body = Buffer.from(json, "utf8");
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
    process.stdout.write(Buffer.concat([header, body]));
    return;
  }

  process.stdout.write(`${json}\n`);
};

const writeJsonRpcError = (
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): void => {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      data
    }
  });
};

const forwardToHttp = async (jsonText: string): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: jsonText,
      signal: controller.signal
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}: ${responseText}`);
    }

    try {
      return JSON.parse(responseText);
    } catch {
      throw new Error("Upstream returned non-JSON response");
    }
  } finally {
    clearTimeout(timeout);
  }
};

const handleMessage = async (jsonText: string): Promise<void> => {
  let message: { id?: string | number | null };

  try {
    message = JSON.parse(jsonText) as { id?: string | number | null };
  } catch {
    writeJsonRpcError(null, -32700, "Parse error");
    return;
  }

  try {
    const upstreamResponse = await forwardToHttp(jsonText);

    if (message.id === undefined) {
      return;
    }

    writeMessage(upstreamResponse);
  } catch (error) {
    if (message.id === undefined) {
      return;
    }

    const reason = error instanceof Error ? error.message : "Unknown proxy error";
    writeJsonRpcError(message.id ?? null, -32000, "Proxy forwarding failed", {
      reason,
      targetUrl
    });
  }
};

let buffer = Buffer.alloc(0);
let textBuffer = "";
let inputMode: "unknown" | "content-length" | "ndjson" = forceContentLength
  ? "content-length"
  : "unknown";

const findHeaderDelimiter = (source: Buffer): { index: number; length: number } | null => {
  const crlfIndex = source.indexOf("\r\n\r\n");
  const lfIndex = source.indexOf("\n\n");

  if (crlfIndex === -1 && lfIndex === -1) {
    return null;
  }

  if (crlfIndex === -1) {
    return { index: lfIndex, length: 2 };
  }

  if (lfIndex === -1) {
    return { index: crlfIndex, length: 4 };
  }

  if (crlfIndex < lfIndex) {
    return { index: crlfIndex, length: 4 };
  }

  return { index: lfIndex, length: 2 };
};

process.stdin.on("data", (chunk: Buffer) => {
  if (inputMode === "unknown") {
    const chunkText = chunk.toString("utf8");
    inputMode = /Content-Length\s*:/i.test(chunkText) ? "content-length" : "ndjson";
  }

  if (inputMode === "ndjson") {
    textBuffer += chunk.toString("utf8");

    while (true) {
      const lineBreak = textBuffer.indexOf("\n");
      if (lineBreak === -1) {
        return;
      }

      const line = textBuffer.slice(0, lineBreak).trim();
      textBuffer = textBuffer.slice(lineBreak + 1);

      if (!line) {
        continue;
      }

      handleMessage(line).catch(() => undefined);
    }
  }

  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const delimiter = findHeaderDelimiter(buffer);
    if (!delimiter) {
      return;
    }

    const headerText = buffer.slice(0, delimiter.index).toString("utf8");
    const lengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText);

    if (!lengthMatch) {
      buffer = buffer.slice(delimiter.index + delimiter.length);
      continue;
    }

    const contentLength = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = delimiter.index + delimiter.length;
    const bodyEnd = bodyStart + contentLength;

    if (buffer.length < bodyEnd) {
      return;
    }

    const jsonText = buffer.slice(bodyStart, bodyEnd).toString("utf8");
    buffer = buffer.slice(bodyEnd);

    handleMessage(jsonText).catch(() => undefined);
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});

process.stdin.resume();
