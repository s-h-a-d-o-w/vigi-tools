// oxlint-disable no-bitwise
import { describe, expect, it } from "vitest";

import { H264Depacketizer, parseRtpPacket } from "./rtp.ts";

const START_CODE = Buffer.from([0, 0, 0, 1]);

type Header = {
  payloadType?: number;
  marker?: boolean;
  sequence?: number;
  timestamp?: number;
  csrcCount?: number;
  padding?: boolean;
  extension?: boolean;
};

function rtpPacket(payload: Buffer, header: Header = {}): Buffer {
  const {
    payloadType = 96,
    marker = false,
    sequence = 7,
    timestamp = 1234,
    csrcCount = 0,
    padding = false,
    extension = false,
  } = header;
  const head = Buffer.alloc(12 + csrcCount * 4);

  head.writeUInt8(
    0x80 | (padding ? 0x20 : 0) | (extension ? 0x10 : 0) | csrcCount,
    0,
  );
  head.writeUInt8((marker ? 0x80 : 0) | payloadType, 1);
  head.writeUInt16BE(sequence, 2);
  head.writeUInt32BE(timestamp, 4);
  head.writeUInt32BE(0xde_ad_be_ef, 8);

  return Buffer.concat([head, payload]);
}

/** A profile-specific extension header carrying `words` 32-bit words. */
function extensionHeader(words: number): Buffer {
  const header = Buffer.alloc(4 + words * 4);
  header.writeUInt16BE(0xbe_de, 0);
  header.writeUInt16BE(words, 2);

  return header;
}

function annexB(...bytes: number[]): Buffer {
  return Buffer.concat([START_CODE, Buffer.from(bytes)]);
}

describe(parseRtpPacket, () => {
  it("reads the header fields and the payload", () => {
    const packet = rtpPacket(Buffer.from([1, 2, 3]), {
      payloadType: 8,
      marker: true,
      sequence: 42,
      timestamp: 90_000,
    });

    expect(parseRtpPacket(packet)).toStrictEqual({
      payloadType: 8,
      marker: true,
      sequence: 42,
      timestamp: 90_000,
      payload: Buffer.from([1, 2, 3]),
    });
  });

  it("skips the contributing source list", () => {
    const packet = rtpPacket(Buffer.from([9]), { csrcCount: 2 });

    expect(parseRtpPacket(packet)?.payload).toStrictEqual(Buffer.from([9]));
  });

  it("skips the extension header", () => {
    const packet = rtpPacket(
      Buffer.concat([extensionHeader(2), Buffer.from([9])]),
      { extension: true },
    );

    expect(parseRtpPacket(packet)?.payload).toStrictEqual(Buffer.from([9]));
  });

  it("strips the padding the sender added", () => {
    const packet = rtpPacket(Buffer.from([9, 0, 0, 3]), { padding: true });

    expect(parseRtpPacket(packet)?.payload).toStrictEqual(Buffer.from([9]));
  });

  it("rejects a packet that is shorter than a header", () => {
    expect(parseRtpPacket(Buffer.alloc(11))).toBeUndefined();
  });

  it("rejects anything that is not RTP version 2", () => {
    const packet = rtpPacket(Buffer.from([9]));
    packet.writeUInt8(0x40, 0);

    expect(parseRtpPacket(packet)).toBeUndefined();
  });

  it("rejects a truncated extension header", () => {
    const packet = rtpPacket(Buffer.from([0xbe, 0xde]), { extension: true });

    expect(parseRtpPacket(packet)).toBeUndefined();
  });

  it("rejects a packet without a payload", () => {
    expect(parseRtpPacket(rtpPacket(Buffer.alloc(0)))).toBeUndefined();
  });
});

describe(H264Depacketizer, () => {
  it("prefixes a single NAL unit with a start code", () => {
    const depacketizer = new H264Depacketizer();

    expect(depacketizer.push(Buffer.from([0x65, 0xaa]))).toStrictEqual([
      annexB(0x65, 0xaa),
    ]);
  });

  it("splits an aggregation packet into its NAL units", () => {
    const depacketizer = new H264Depacketizer();
    const stapA = Buffer.from([0x78, 0x00, 0x02, 0x67, 0x42, 0x00, 0x01, 0x68]);

    expect(depacketizer.push(stapA)).toStrictEqual([
      annexB(0x67, 0x42),
      annexB(0x68),
    ]);
  });

  it("stops at a NAL unit the aggregation packet does not contain", () => {
    const depacketizer = new H264Depacketizer();
    const stapA = Buffer.from([0x78, 0x00, 0x02, 0x67, 0x00, 0x09, 0x68]);

    expect(depacketizer.push(stapA)).toStrictEqual([annexB(0x67, 0x00)]);
  });

  it("reassembles a fragmented NAL unit and restores its header", () => {
    const depacketizer = new H264Depacketizer();

    expect(depacketizer.push(Buffer.from([0x7c, 0x85, 0xaa]))).toStrictEqual(
      [],
    );
    expect(depacketizer.push(Buffer.from([0x7c, 0x05, 0xbb]))).toStrictEqual(
      [],
    );
    expect(depacketizer.push(Buffer.from([0x7c, 0x45, 0xcc]))).toStrictEqual([
      annexB(0x65, 0xaa, 0xbb, 0xcc),
    ]);
  });

  it("drops a fragment whose start packet was lost", () => {
    const depacketizer = new H264Depacketizer();

    expect(depacketizer.push(Buffer.from([0x7c, 0x45, 0xcc]))).toStrictEqual(
      [],
    );
  });

  it("starts over when a new fragmented unit begins", () => {
    const depacketizer = new H264Depacketizer();

    expect(depacketizer.push(Buffer.from([0x7c, 0x85, 0xaa]))).toStrictEqual(
      [],
    );
    expect(depacketizer.push(Buffer.from([0x7c, 0x85, 0xbb]))).toStrictEqual(
      [],
    );
    expect(depacketizer.push(Buffer.from([0x7c, 0x45, 0xcc]))).toStrictEqual([
      annexB(0x65, 0xbb, 0xcc),
    ]);
  });

  it("ignores payloads it cannot make sense of", () => {
    const depacketizer = new H264Depacketizer();

    expect(depacketizer.push(Buffer.alloc(0))).toStrictEqual([]);
    // STAP-B, which the device never sends.
    expect(depacketizer.push(Buffer.from([0x19, 0x00]))).toStrictEqual([]);
    expect(depacketizer.push(Buffer.from([0x7c, 0x85]))).toStrictEqual([]);
  });
});
