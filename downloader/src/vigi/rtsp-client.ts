import { createConnection, type Socket } from "node:net";

export type RtspMessage = {
  statusLine: string;
  statusCode: number;
  headers: Map<string, string>;
  body: string;
};

export type RtspClientOptions = {
  host: string;
  port: number;
  requestTimeoutMs?: number;
  onFrame: (channel: number, payload: Buffer) => void;
  onNotification?: (body: string) => void;
};

type Waiter = {
  resolve: (message: RtspMessage) => void;
  reject: (error: Error) => void;
};

const INTERLEAVED_MAGIC = 0x24; // '$'

function parseHead(head: string): {
  statusLine: string;
  headers: Map<string, string>;
} {
  const [statusLine = "", ...headerLines] = head.split("\r\n");
  const headers = new Map<string, string>();

  for (const line of headerLines) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      headers.set(
        line.slice(0, separator).trim().toLowerCase(),
        line.slice(separator + 1).trim(),
      );
    }
  }

  return { statusLine, headers };
}

/**
 * Minimal RTSP client that also handles the RTP-over-TCP interleaved frames the
 * device pushes over the very same connection.
 */
export class RtspClient {
  readonly #options: RtspClientOptions;
  #socket: Socket | undefined;
  #buffer: Buffer = Buffer.alloc(0);
  #cseq = 0;
  #waiters: Waiter[] = [];
  #closed = false;
  #closeResolvers: (() => void)[] = [];

  constructor(options: RtspClientOptions) {
    this.#options = options;
  }

  async connect(): Promise<void> {
    const socket = await new Promise<Socket>((resolve, reject) => {
      const pending = createConnection({
        host: this.#options.host,
        port: this.#options.port,
      });

      const onError = (error: Error) => reject(error);
      pending.once("error", onError);
      pending.once("connect", () => {
        pending.off("error", onError);
        resolve(pending);
      });
    });

    socket.on("data", (chunk: Buffer) => this.#handleData(chunk));
    socket.on("error", (error: Error) => this.#fail(error));
    socket.on("close", () => this.#handleClose());

    this.#socket = socket;
  }

  request(
    method: string,
    uri: string,
    headers: Record<string, string> = {},
    body?: string,
  ): Promise<RtspMessage> {
    const socket = this.#socket;
    if (socket === undefined || this.#closed) {
      throw new Error("RTSP connection is not open");
    }

    this.#cseq += 1;
    const lines = [`${method} ${uri} RTSP/1.0`, `CSeq: ${this.#cseq}`];

    for (const [name, value] of Object.entries(headers)) {
      lines.push(`${name}: ${value}`);
    }

    if (body !== undefined) {
      lines.push(
        "Content-Type: application/json",
        `Content-Length: ${Buffer.byteLength(body)}`,
      );
    }

    const response = this.#nextResponse(`${method} ${uri}`);
    socket.write(`${lines.join("\r\n")}\r\n\r\n${body ?? ""}`);

    return response;
  }

  /** Resolves once the device has closed the connection. */
  waitForClose(): Promise<void> {
    if (this.#closed) {
      return Promise.resolve();
    }

    return new Promise((resolve) => this.#closeResolvers.push(resolve));
  }

  close(): void {
    this.#socket?.destroy();
    this.#handleClose();
  }

  #nextResponse(description: string): Promise<RtspMessage> {
    const timeoutMs = this.#options.requestTimeoutMs ?? 15_000;
    let timeout: NodeJS.Timeout | undefined;

    const response = new Promise<RtspMessage>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject };

      timeout = setTimeout(() => {
        this.#waiters = this.#waiters.filter((entry) => entry !== waiter);
        reject(new Error(`Timed out waiting for a response to ${description}`));
      }, timeoutMs);

      this.#waiters.push(waiter);
    });

    return response.finally(() => clearTimeout(timeout));
  }

  #handleData(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);

    for (;;) {
      if (this.#buffer.length === 0) {
        return;
      }

      if (this.#buffer.readUInt8(0) === INTERLEAVED_MAGIC) {
        if (!this.#consumeInterleavedFrame()) {
          return;
        }
        continue;
      }

      // Some devices pad messages with stray line breaks.
      if (
        this.#buffer.readUInt8(0) === 0x0d ||
        this.#buffer.readUInt8(0) === 0x0a
      ) {
        this.#buffer = this.#buffer.subarray(1);
        continue;
      }

      if (!this.#consumeMessage()) {
        return;
      }
    }
  }

  #consumeInterleavedFrame(): boolean {
    if (this.#buffer.length < 4) {
      return false;
    }

    const length = this.#buffer.readUInt16BE(2);
    if (this.#buffer.length < 4 + length) {
      return false;
    }

    const channel = this.#buffer.readUInt8(1);
    const payload = Buffer.from(this.#buffer.subarray(4, 4 + length));
    this.#buffer = this.#buffer.subarray(4 + length);
    this.#options.onFrame(channel, payload);

    return true;
  }

  #consumeMessage(): boolean {
    const headEnd = this.#buffer.indexOf("\r\n\r\n");
    if (headEnd === -1) {
      return false;
    }

    const { statusLine, headers } = parseHead(
      this.#buffer.subarray(0, headEnd).toString("utf8"),
    );
    const contentLength = Number(headers.get("content-length") ?? 0);
    const messageEnd = headEnd + 4 + contentLength;

    if (this.#buffer.length < messageEnd) {
      return false;
    }

    const body = this.#buffer
      .subarray(headEnd + 4, messageEnd)
      .toString("utf8");
    this.#buffer = this.#buffer.subarray(messageEnd);

    this.#deliver({
      statusLine,
      statusCode: Number(statusLine.split(" ")[1] ?? 0),
      headers,
      body,
    });

    return true;
  }

  #deliver(message: RtspMessage): void {
    const isResponse =
      message.statusLine.startsWith("RTSP/") &&
      !message.body.includes('"notification"');

    if (!isResponse) {
      this.#options.onNotification?.(message.body);
      return;
    }

    const waiter = this.#waiters.shift();
    waiter?.resolve(message);
  }

  #fail(error: Error): void {
    const waiters = this.#waiters;
    this.#waiters = [];
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }

  #handleClose(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#fail(new Error("RTSP connection closed"));

    const resolvers = this.#closeResolvers;
    this.#closeResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }
}
