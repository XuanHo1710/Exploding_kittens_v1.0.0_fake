/** PRNG tất định dùng chung client / server (cùng seed -> cùng chuỗi số). */
export class Mulberry32 {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 0x13579bdf;
  }
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
