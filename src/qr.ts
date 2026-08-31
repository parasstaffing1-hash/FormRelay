/**
 * Zero-dependency QR Code SVG Generator for FormRelay
 * Implements ISO/IEC 18004 QR Code Byte Mode with Reed-Solomon Error Correction
 */

// Galois Field GF(256) tables for Reed-Solomon coding
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGenPoly(nsym: number): Uint8Array {
  let g = new Uint8Array([1]);
  for (let i = 0; i < nsym; i++) {
    const next = new Uint8Array(g.length + 1);
    const root = GF256_EXP[i];
    for (let j = 0; j < g.length; j++) {
      next[j] ^= gfMul(g[j], root);
      next[j + 1] ^= g[j];
    }
    g = next;
  }
  return g;
}

function rsEncode(msg: Uint8Array, nsym: number): Uint8Array {
  const gen = rsGenPoly(nsym);
  const remainder = new Uint8Array(nsym);
  for (let i = 0; i < msg.length; i++) {
    const coef = msg[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[nsym - 1] = 0;
    for (let j = 0; j < nsym; j++) {
      remainder[j] ^= gfMul(gen[j], coef);
    }
  }
  return remainder;
}

// Version table: [version, totalCodewords, ecCodewords, ecBlocks]
// Using Medium error correction
const VERSION_TABLE: [number, number, number, number][] = [
  [1, 26, 10, 1],
  [2, 44, 16, 1],
  [3, 70, 26, 1],
  [4, 100, 36, 2],
  [5, 134, 48, 2],
  [6, 172, 64, 4],
  [7, 196, 72, 4],
  [8, 242, 88, 4],
  [9, 292, 110, 5],
  [10, 346, 130, 5],
];

// Alignment pattern positions per version
const ALIGNMENT_PATTERNS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export class QRCode {
  public size: number;
  public modules: boolean[][];
  public isFunction: boolean[][];

  constructor(public version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => Array(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => Array(this.size).fill(false));
  }

  private setModule(r: number, c: number, val: boolean, isFn: boolean = true) {
    this.modules[r][c] = val;
    if (isFn) this.isFunction[r][c] = true;
  }

  public setupPositionProbePattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (row + r >= 0 && row + r < this.size && col + c >= 0 && col + c < this.size) {
          const val =
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          this.setModule(row + r, col + c, val);
        }
      }
    }
  }

  public setupTimingPattern() {
    for (let i = 8; i < this.size - 8; i++) {
      const val = i % 2 === 0;
      if (!this.isFunction[6][i]) this.setModule(6, i, val);
      if (!this.isFunction[i][6]) this.setModule(i, 6, val);
    }
  }

  public setupAlignmentPatterns() {
    const coords = ALIGNMENT_PATTERNS[this.version] || [];
    for (let i = 0; i < coords.length; i++) {
      for (let j = 0; j < coords.length; j++) {
        const row = coords[i];
        const col = coords[j];
        if (this.isFunction[row][col]) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const val = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
            this.setModule(row + r, col + c, val);
          }
        }
      }
    }
  }

  public reserveFormatInfo() {
    for (let i = 0; i < 9; i++) {
      if (i !== 6) this.setModule(8, i, false);
      if (i !== 6) this.setModule(i, 8, false);
    }
    for (let i = 0; i < 8; i++) {
      this.setModule(8, this.size - 1 - i, false);
      this.setModule(this.size - 1 - i, 8, false);
    }
    this.setModule(this.size - 8, 8, true);
  }

  public setFormatInfo(mask: number) {
    const formatData = (0 << 3) | mask;
    let rem = formatData << 10;
    for (let i = 14; i >= 10; i--) {
      if ((rem >> i) & 1) {
        rem ^= 0x537 << (i - 10);
      }
    }
    const formatBits = ((formatData << 10) | rem) ^ 0x5412;

    for (let i = 0; i < 15; i++) {
      const bit = ((formatBits >> i) & 1) === 1;
      if (i < 6) this.modules[i][8] = bit;
      else if (i < 8) this.modules[i + 1][8] = bit;
      else this.modules[this.size - 15 + i][8] = bit;

      if (i < 8) this.modules[8][this.size - 1 - i] = bit;
      else if (i < 9) this.modules[8][15 - i] = bit;
      else this.modules[8][14 - i] = bit;
    }
  }

  public writeData(data: Uint8Array, mask: number) {
    let bitIndex = 0;
    const totalBits = data.length * 8;

    let dir = -1;
    let row = this.size - 1;
    let col = this.size - 1;

    while (col > 0) {
      if (col === 6) col--;
      for (let i = 0; i < this.size; i++) {
        const r = row;
        for (let c = col; c >= col - 1; c--) {
          if (!this.isFunction[r][c]) {
            let bit = false;
            if (bitIndex < totalBits) {
              const byte = data[Math.floor(bitIndex / 8)];
              bit = ((byte >> (7 - (bitIndex % 8))) & 1) === 1;
              bitIndex++;
            }
            let maskBit = false;
            switch (mask) {
              case 0: maskBit = (r + c) % 2 === 0; break;
              case 1: maskBit = r % 2 === 0; break;
              case 2: maskBit = c % 3 === 0; break;
              case 3: maskBit = (r + c) % 3 === 0; break;
              case 4: maskBit = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
              case 5: maskBit = ((r * c) % 2) + ((r * c) % 3) === 0; break;
              case 6: maskBit = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
              case 7: maskBit = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
            }
            this.modules[r][c] = bit !== maskBit;
          }
        }
        row += dir;
      }
      dir = -dir;
      row += dir;
      col -= 2;
    }
  }
}

function encodeText(text: string): { version: number; codewords: Uint8Array } {
  const utf8 = new TextEncoder().encode(text);
  let v = 1;
  for (let i = 0; i < VERSION_TABLE.length; i++) {
    const [ver, total, ec] = VERSION_TABLE[i];
    const dataCap = total - ec;
    const charCountBits = ver < 10 ? 8 : 16;
    const requiredBits = 4 + charCountBits + utf8.length * 8;
    if (requiredBits <= dataCap * 8) {
      v = ver;
      break;
    }
  }

  const vInfo = VERSION_TABLE.find(([ver]) => ver === v) || VERSION_TABLE[VERSION_TABLE.length - 1];
  const dataCodewordsCount = vInfo[1] - vInfo[2];
  const ecCodewordsCount = vInfo[2];
  const ecBlocks = vInfo[3];

  const bitBuffer: number[] = [];
  const appendBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  };

  appendBits(4, 4); // Byte mode
  appendBits(utf8.length, v < 10 ? 8 : 16);
  for (const b of utf8) {
    appendBits(b, 8);
  }
  const maxDataBits = dataCodewordsCount * 8;
  const termLen = Math.min(4, maxDataBits - bitBuffer.length);
  appendBits(0, termLen);
  while (bitBuffer.length % 8 !== 0) {
    bitBuffer.push(0);
  }
  const padBytes = [0xec, 0x11];
  let pIdx = 0;
  while (bitBuffer.length < maxDataBits) {
    appendBits(padBytes[pIdx % 2], 8);
    pIdx++;
  }

  const dataCodewords = new Uint8Array(dataCodewordsCount);
  for (let i = 0; i < dataCodewordsCount; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bitBuffer[i * 8 + b];
    }
    dataCodewords[i] = byte;
  }

  const ecPerBlock = Math.floor(ecCodewordsCount / ecBlocks);
  const dataPerBlock = Math.floor(dataCodewordsCount / ecBlocks);

  const finalCodewords = new Uint8Array(vInfo[1]);
  let offset = 0;
  const blocksData: Uint8Array[] = [];
  const blocksEc: Uint8Array[] = [];

  for (let b = 0; b < ecBlocks; b++) {
    const dBlock = dataCodewords.slice(b * dataPerBlock, (b + 1) * dataPerBlock);
    const ecBlock = rsEncode(dBlock, ecPerBlock);
    blocksData.push(dBlock);
    blocksEc.push(ecBlock);
  }

  for (let i = 0; i < dataPerBlock; i++) {
    for (let b = 0; b < ecBlocks; b++) {
      finalCodewords[offset++] = blocksData[b][i];
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < ecBlocks; b++) {
      finalCodewords[offset++] = blocksEc[b][i];
    }
  }

  return { version: v, codewords: finalCodewords };
}

export function generateQrMatrix(text: string): boolean[][] {
  const { version, codewords } = encodeText(text);
  const qr = new QRCode(version);

  qr.setupPositionProbePattern(0, 0);
  qr.setupPositionProbePattern(qr.size - 7, 0);
  qr.setupPositionProbePattern(0, qr.size - 7);
  qr.setupTimingPattern();
  qr.setupAlignmentPatterns();
  qr.reserveFormatInfo();

  const mask = 0;
  qr.writeData(codewords, mask);
  qr.setFormatInfo(mask);

  return qr.modules;
}

export function generateQrSvg(text: string, options: { size?: number; margin?: number; fgColor?: string; bgColor?: string } = {}): string {
  const matrix = generateQrMatrix(text);
  const moduleCount = matrix.length;
  const margin = options.margin ?? 2;
  const totalModules = moduleCount + margin * 2;
  const size = options.size ?? 220;
  const fg = options.fgColor ?? "#111827";
  const bg = options.bgColor ?? "#ffffff";

  let pathData = "";
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c]) {
        const x = c + margin;
        const y = r + margin;
        pathData += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${totalModules}" height="${totalModules}" fill="${bg}"/><path d="${pathData.trim()}" fill="${fg}"/></svg>`;
}
