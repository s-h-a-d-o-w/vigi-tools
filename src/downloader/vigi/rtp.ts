// oxlint-disable no-bitwise
const START_CODE = Buffer.from([0, 0, 0, 1]);

export type RtpPacket = {
  payloadType: number;
  sequence: number;
  timestamp: number;
  marker: boolean;
  payload: Buffer;
};

export function parseRtpPacket(packet: Buffer): RtpPacket | undefined {
  if (packet.length < 12) {
    return undefined;
  }

  const first = packet.readUInt8(0);
  if (first >> 6 !== 2) {
    return undefined;
  }

  const hasPadding = (first & 0x20) !== 0;
  const hasExtension = (first & 0x10) !== 0;
  const csrcCount = first & 0x0f;

  let start = 12 + csrcCount * 4;
  if (hasExtension) {
    if (packet.length < start + 4) {
      return undefined;
    }
    start += 4 + packet.readUInt16BE(start + 2) * 4;
  }

  let end = packet.length;
  if (hasPadding) {
    end -= packet.readUInt8(packet.length - 1);
  }

  if (start >= end || end > packet.length) {
    return undefined;
  }

  const second = packet.readUInt8(1);

  return {
    payloadType: second & 0x7f,
    marker: (second & 0x80) !== 0,
    sequence: packet.readUInt16BE(2),
    timestamp: packet.readUInt32BE(4),
    payload: packet.subarray(start, end),
  };
}

function toAnnexB(nalUnit: Buffer): Buffer {
  return Buffer.concat([START_CODE, nalUnit]);
}

function readAggregated(payload: Buffer): Buffer[] {
  const units: Buffer[] = [];
  let offset = 1;

  while (offset + 2 <= payload.length) {
    const size = payload.readUInt16BE(offset);
    offset += 2;

    if (size === 0 || offset + size > payload.length) {
      break;
    }

    units.push(toAnnexB(payload.subarray(offset, offset + size)));
    offset += size;
  }

  return units;
}

/**
 * Turns RFC 6184 RTP payloads (single NAL, STAP-A and FU-A) into Annex B NAL units.
 */
export class H264Depacketizer {
  #fragments: Buffer[] = [];

  push(payload: Buffer): Buffer[] {
    if (payload.length === 0) {
      return [];
    }

    const packetType = payload.readUInt8(0) & 0x1f;

    if (packetType >= 1 && packetType <= 23) {
      return [toAnnexB(payload)];
    }

    if (packetType === 24) {
      return readAggregated(payload);
    }

    if (packetType === 28) {
      return this.#readFragment(payload);
    }

    return [];
  }

  #readFragment(payload: Buffer): Buffer[] {
    if (payload.length < 3) {
      return [];
    }

    const indicator = payload.readUInt8(0);
    const header = payload.readUInt8(1);
    const isStart = (header & 0x80) !== 0;
    const isEnd = (header & 0x40) !== 0;

    if (isStart) {
      const reconstructedHeader = Buffer.from([
        (indicator & 0xe0) | (header & 0x1f),
      ]);
      this.#fragments = [reconstructedHeader, payload.subarray(2)];
    } else if (this.#fragments.length > 0) {
      this.#fragments.push(payload.subarray(2));
    } else {
      // Fragment without its start packet - the NAL unit is unrecoverable.
      return [];
    }

    if (!isEnd) {
      return [];
    }

    const unit = toAnnexB(Buffer.concat(this.#fragments));
    this.#fragments = [];

    return [unit];
  }
}
