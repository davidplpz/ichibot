import type { AgentState } from '@ichibot/shared';

const TAU = Math.PI * 2;

export type Appearance = 'mochi' | 'face' | 'face2' | 'face3' | 'face4';

const APPEARANCE_ASSETS: Record<Exclude<Appearance, 'mochi'>, string> = {
  face: '/avatars/face.png',
  face2: '/avatars/face2.png',
  face3: '/avatars/face3.png',
  face4: '/avatars/face4.png'
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export class Mochi {
  ctx: CanvasRenderingContext2D;
  cutout: HTMLCanvasElement | null = null;
  cutouts = new Map<string, HTMLCanvasElement>();
  w = 160;
  h = 160;
  t = 0;
  bodyY = 0;
  bodyScale = 1;
  squish = 1;
  eyeX = 0;
  eyeY = 0;
  blink = 0;
  blinkTimer = 0;
  tilt = 0;
  breathe = 0;
  state: AgentState = 'idle';
  thought = '';
  appearance: Appearance = 'face';

  constructor(c: HTMLCanvasElement, initialAppearance: Appearance = 'face') {
    const x = c.getContext('2d');
    if (!x) throw new Error('no canvas');
    this.ctx = x;
    this.appearance = initialAppearance;
    if (initialAppearance !== 'mochi') this.loadAppearance(initialAppearance);
  }

  setState(s: AgentState) {
    this.state = s;
  }

  setAppearance(appearance: Appearance) {
    this.appearance = appearance;
    this.cutout = this.cutouts.get(appearance) || null;
    if (appearance !== 'mochi' && !this.cutout) this.loadAppearance(appearance);
  }

  setThought(t: string) {
    this.thought = t;
  }

  update(dt: number) {
    this.t += dt;
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 0.08 + Math.random() * 2.2;
    }
    this.blink = lerp(this.blink, 0, 0.25);
    const b = 0.5 + Math.sin(this.t * 0.8) * 0.5;
    this.breathe = b * 0.01;
    this.eyeX = lerp(this.eyeX, 0, 0.08);
    this.eyeY = lerp(this.eyeY, 0, 0.08);
    switch (this.state) {
      case 'idle':
        this.bodyY = lerp(this.bodyY, Math.sin(this.t * 0.6) * 0.5, 0.05);
        this.bodyScale = lerp(this.bodyScale, 1 + this.breathe, 0.08);
        this.squish = lerp(this.squish, 1, 0.08);
        this.tilt = lerp(this.tilt, Math.sin(this.t * 0.25) * 0.01, 0.05);
        break;
      case 'thinking':
        this.bodyY = lerp(this.bodyY, -1.5 + Math.sin(this.t * 1.2) * 0.5, 0.1);
        this.bodyScale = lerp(this.bodyScale, 1.01 + this.breathe * 0.5, 0.08);
        this.squish = lerp(this.squish, 0.995, 0.08);
        this.tilt = lerp(this.tilt, -0.01 + Math.sin(this.t * 0.5) * 0.004, 0.08);
        break;
      case 'tool_call':
        this.bodyY = lerp(this.bodyY, -0.5, 0.12);
        this.bodyScale = lerp(this.bodyScale, 0.995, 0.12);
        this.squish = lerp(this.squish, 0.97, 0.12);
        this.tilt = lerp(this.tilt, 0.01 * Math.sin(this.t * 2.5), 0.12);
        break;
      case 'streaming':
        this.bodyY = lerp(this.bodyY, Math.sin(this.t * 1.4) * 0.8, 0.08);
        this.bodyScale = lerp(this.bodyScale, 1.008, 0.08);
        this.squish = lerp(this.squish, 0.998, 0.08);
        this.tilt = lerp(this.tilt, Math.sin(this.t * 0.9) * 0.006, 0.08);
        break;
      case 'needs_approval':
        this.bodyY = lerp(this.bodyY, -2, 0.12);
        this.bodyScale = lerp(this.bodyScale, 1.02, 0.12);
        this.squish = lerp(this.squish, 1.01, 0.12);
        this.tilt = lerp(this.tilt, 0, 0.1);
        break;
      case 'success':
        this.bodyY = lerp(this.bodyY, -4 + Math.sin(this.t * 2) * 0.5, 0.15);
        this.bodyScale = lerp(this.bodyScale, 1.03, 0.15);
        this.squish = lerp(this.squish, 1.01, 0.15);
        this.tilt = lerp(this.tilt, 0, 0.1);
        break;
      case 'error':
        this.bodyY = lerp(this.bodyY, 0.5, 0.12);
        this.bodyScale = lerp(this.bodyScale, 0.99, 0.12);
        this.squish = lerp(this.squish, 0.96, 0.12);
        this.tilt = lerp(this.tilt, -0.012, 0.12);
        break;
      default:
        this.bodyY = lerp(this.bodyY, 0, 0.05);
        this.bodyScale = lerp(this.bodyScale, 1, 0.05);
        this.squish = lerp(this.squish, 1, 0.05);
        this.tilt = lerp(this.tilt, 0, 0.05);
    }
  }

  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);

    // Use the supplied character art when available. The procedural Mochi
    // below remains as a fallback for slow or failed asset loads.
    if (this.appearance !== 'mochi' && this.cutout) {
      c.save();
      c.translate(this.w / 2, this.h / 2 + this.bodyY);
      c.rotate(this.tilt);
      c.scale(this.bodyScale * (1 / this.squish), this.bodyScale * this.squish);
      const assetScale = 0.9;
      const assetWidth = this.w * assetScale;
      const assetHeight = this.h * assetScale;
      c.drawImage(this.cutout, -assetWidth / 2, -assetHeight / 2, assetWidth, assetHeight);
      c.restore();
      return;
    }

    c.save();
    c.translate(this.w / 2, this.h / 2 + 6 + this.bodyY);
    c.rotate(this.tilt);
    c.scale(this.bodyScale * (1 / this.squish), this.bodyScale * this.squish);
    c.save();
    c.scale(1, 0.25);
    const g = c.createRadialGradient(0, 180, 10, 0, 180, 46);
    g.addColorStop(0, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 180, 44, 14, 0, 0, TAU);
    c.fill();
    c.restore();
    const r = 36;
    const bg = c.createLinearGradient(0, -r - 10, 0, r + 10);
    bg.addColorStop(0, '#f5f7ff');
    bg.addColorStop(1, '#dfe6ff');
    c.fillStyle = bg;
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2.5;
    this.roundRect(c, -r, -r, 2 * r, 2 * r, 14);
    c.fill();
    c.stroke();
    c.save();
    c.clip();
    const inr = c.createRadialGradient(0, -20, 6, 0, 0, r + 2);
    inr.addColorStop(0, 'rgba(255,255,255,0.9)');
    inr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = inr;
    c.beginPath();
    c.arc(0, 0, r + 10, 0, TAU);
    c.fill();
    c.restore();
    const ey = -6,
      er = 9.5,
      pr = 5;
    c.fillStyle = '#fff';
    c.beginPath();
    c.ellipse(-10, ey, er, er * (1 - this.blink * 0.92), 0, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(20,20,40,0.12)';
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.ellipse(10, ey, er, er * (1 - this.blink * 0.92), 0, 0, TAU);
    c.fill();
    c.stroke();
    const px = this.eyeX * 1.2,
      py = this.eyeY * 0.6;
    c.fillStyle = '#111827';
    c.beginPath();
    c.ellipse(-10 + px, ey + py, pr * (1 - this.blink * 0.4), pr * (1.05 - this.blink * 0.5), 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(10 + px, ey + py, pr * (1 - this.blink * 0.4), pr * (1.05 - this.blink * 0.5), 0, 0, TAU);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(-10 + px + 1, ey + py - 1.5, 1.8, 0, TAU);
    c.arc(10 + px + 1, ey + py - 1.5, 1.8, 0, TAU);
    c.fill();
    c.strokeStyle = '#1f2937';
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    if (this.state === 'needs_approval' || this.state === 'error') {
      c.beginPath();
      c.arc(0, 6, 6, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
    } else if (this.state === 'success') {
      c.beginPath();
      c.arc(0, 2, 6, -Math.PI * 0.15, Math.PI * 1.15);
      c.stroke();
    } else if (this.state === 'thinking' || this.state === 'tool_call') {
      c.beginPath();
      c.moveTo(-4, 6);
      c.lineTo(4, 6);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(0, 4, 5.5, 0, Math.PI);
      c.stroke();
    }
    c.restore();
  }

  private loadAppearance(appearance: Exclude<Appearance, 'mochi'>) {
    const image = new Image();
    image.onload = () => {
      const cutout = this.removeCheckerboard(image);
      this.cutouts.set(appearance, cutout);
      if (this.appearance === appearance) this.cutout = cutout;
    };
    image.src = APPEARANCE_ASSETS[appearance];
  }

  private removeCheckerboard(image: HTMLImageElement) {
    const source = document.createElement('canvas');
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sourceCtx = source.getContext('2d');
    if (!sourceCtx) return source;
    sourceCtx.drawImage(image, 0, 0);

    const result = document.createElement('canvas');
    result.width = source.width;
    result.height = source.height;
    const resultCtx = result.getContext('2d');
    if (!resultCtx) return source;

    const pixels = sourceCtx.getImageData(0, 0, source.width, source.height);
    const { data, width, height } = pixels;
    const visited = new Uint8Array(width * height);
    const queue: number[] = [];

    const isBackground = (index: number) => {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const brightness = (r + g + b) / 3;
      return Math.max(r, g, b) - Math.min(r, g, b) < 12 && brightness > 205;
    };

    const enqueue = (x: number, y: number) => {
      const index = y * width + x;
      if (visited[index]) return;
      visited[index] = 1;
      if (isBackground(index * 4)) queue.push(index);
    };

    for (let x = 0; x < width; x++) {
      enqueue(x, 0);
      enqueue(x, height - 1);
    }
    for (let y = 1; y < height - 1; y++) {
      enqueue(0, y);
      enqueue(width - 1, y);
    }

    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      data[index * 4 + 3] = 0;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) enqueue(x - 1, y);
      if (x + 1 < width) enqueue(x + 1, y);
      if (y > 0) enqueue(x, y - 1);
      if (y + 1 < height) enqueue(x, y + 1);
    }

    resultCtx.putImageData(pixels, 0, 0);
    return result;
  }

  private roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const R = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + R, y);
    c.arcTo(x + w, y, x + w, y + h, R);
    c.arcTo(x + w, y + h, x, y + h, R);
    c.arcTo(x, y + h, x, y, R);
    c.arcTo(x, y, x + w, y, R);
    c.closePath();
  }
}
