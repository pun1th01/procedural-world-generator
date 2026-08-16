import { promises as fs } from "node:fs";
import path from "node:path";
import {
  editSource,
  SourceEditError,
} from "@click-to-source/core/dist/sourceEditor.js";

const READ_FILE_PATH = "/__cts/read-file";
const WRITE_FILE_PATH = "/__cts/write-file";

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);

  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");

  if (!body) {
    throw new Error("empty request body");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error("invalid JSON body");
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseRequestBody(body, operation) {
  if (!isRecord(body) || typeof body.file !== "string" || body.file.length === 0) {
    throw new Error("invalid request body");
  }

  if (operation === "write") {
    const hasEditFields =
      hasOwn(body, "line") || hasOwn(body, "argName") || hasOwn(body, "newValue");

    if (hasEditFields) {
      if (
        !Number.isInteger(body.line) ||
        body.line < 1 ||
        typeof body.argName !== "string" ||
        body.argName.length === 0 ||
        !hasOwn(body, "newValue") ||
        (hasOwn(body, "content") && typeof body.content !== "string")
      ) {
        throw new Error("invalid request body");
      }

      return {
        file: body.file,
        content: typeof body.content === "string" ? body.content : undefined,
        edit: {
          file: body.file,
          line: body.line,
          argName: body.argName,
          newValue: body.newValue,
        },
      };
    }

    if (typeof body.content !== "string") {
      throw new Error("invalid request body");
    }

    return { file: body.file, content: body.content };
  }

  return { file: body.file };
}

function isWindowsAbsolutePath(file) {
  return /^[a-zA-Z]:/.test(file) || file.startsWith("\\\\");
}

function isInsideRoot(root, candidate) {
  const relativePath = path.relative(root, candidate);

  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function resolveLexicalPath(root, requestedFile) {
  if (
    requestedFile.includes("\0") ||
    path.isAbsolute(requestedFile) ||
    isWindowsAbsolutePath(requestedFile)
  ) {
    return null;
  }

  // Treat both slash styles as separators so Windows traversal attempts are
  // rejected consistently even if the server is later run on another OS.
  const normalizedFile = requestedFile.replace(/[\\/]+/g, path.sep);
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(resolvedRoot, normalizedFile);

  return isInsideRoot(resolvedRoot, resolvedFile) ? resolvedFile : null;
}

async function resolveSafePath(root, requestedFile) {
  const lexicalPath = resolveLexicalPath(root, requestedFile);

  if (!lexicalPath) {
    return null;
  }

  const resolvedRoot = await fs.realpath(root);
  let existingPath = lexicalPath;
  const missingPathParts = [];

  while (true) {
    try {
      const realExistingPath = await fs.realpath(existingPath);
      const realCandidate = path.resolve(
        realExistingPath,
        ...missingPathParts.reverse()
      );

      return isInsideRoot(resolvedRoot, realCandidate) ? lexicalPath : null;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }

      const parentPath = path.dirname(existingPath);

      if (parentPath === existingPath) {
        return null;
      }

      missingPathParts.push(path.basename(existingPath));
      existingPath = parentPath;
    }
  }
}

async function handleFileRequest(request, response, root, operation) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  let parsedRequest;

  try {
    parsedRequest = parseRequestBody(await readJsonBody(request), operation);
  } catch {
    sendJson(response, 400, { error: "Invalid request body" });
    return;
  }

  let filePath;

  try {
    filePath = await resolveSafePath(root, parsedRequest.file);
  } catch {
    sendJson(response, 500, { error: "Filesystem failure" });
    return;
  }

  if (!filePath) {
    sendJson(response, 400, { error: "Invalid file path" });
    return;
  }

  try {
    if (operation === "read") {
      const content = await fs.readFile(filePath, "utf8");
      sendJson(response, 200, { content });
      return;
    }

    let content = parsedRequest.content;

    if ("edit" in parsedRequest) {
      const source = content ?? (await fs.readFile(filePath, "utf8"));

      try {
        content = editSource(source, parsedRequest.edit);
      } catch (error) {
        if (error instanceof SourceEditError) {
          sendJson(response, 400, {
            error: "Source edit failed",
            code: error.code,
          });
          return;
        }

        sendJson(response, 500, { error: "Source edit failure" });
        return;
      }
    }

    await fs.writeFile(filePath, content, "utf8");
    sendJson(response, 200, { success: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "File not found" });
      return;
    }

    sendJson(response, 500, { error: "Filesystem failure" });
  }
}

export function fileIoPlugin() {
  let resolvedConfig;

  return {
    name: "click-to-source-file-io",
    apply: "serve",
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let pathname;

        try {
          pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        } catch {
          next();
          return;
        }

        if (pathname === READ_FILE_PATH) {
          void handleFileRequest(
            request,
            response,
            resolvedConfig.root,
            "read"
          );
          return;
        }

        if (pathname === WRITE_FILE_PATH) {
          void handleFileRequest(
            request,
            response,
            resolvedConfig.root,
            "write"
          );
          return;
        }

        next();
      });
    },
  };
}
