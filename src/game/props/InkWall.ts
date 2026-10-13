import * as THREE from 'three';
import { Crystal } from '../../engine/stage/Crystal';
import { glowTexture } from '../../engine/paper/textures';

/** 縦書きの1行（右から順に浮かぶ）。faint は読めないほど薄い行 */
const COLUMNS: Array<{ text: string; faint?: boolean }> = [
  { text: 'カガチ' },
  { text: '偽の灯晶を求む' },
  { text: '星祭り' },
  { text: '最初の灯りは', faint: true },
  { text: '古き灯りの下に眠る', faint: true },
];
/** 1文字の大きさ（m） */
const CHAR = 0.24;
const PX = 128;

/** 縦書きの1行を金色の筆文字で描いた絵（台本で浮かぶときに作る。筆文字の書体が読み込まれてから描くため） */
function columnTexture(text: string, faint: boolean): THREE.Texture {
  const chars = [...text];
  const c = document.createElement('canvas');
  c.width = PX;
  c.height = PX * chars.length;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${PX * 0.82}px 'Yuji Syuku', 'Hiragino Mincho ProN', 'Yu Mincho', serif`;
  g.shadowColor = faint ? 'rgba(255,214,140,0.4)' : 'rgba(255,196,90,0.95)';
  g.shadowBlur = faint ? 6 : 18;
  g.fillStyle = faint ? 'rgba(255,226,170,0.55)' : '#ffe6a8';
  chars.forEach((ch, i) => g.fillText(ch, PX / 2, PX * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 工房の壁の、光で読む墨の伝言（第三話）。ふだんは何も見えない。
 * 台本の `@演出 墨 浮かぶ` で、守り灯（小さな本物の灯晶）が壁の前に掲げられ、金色の文字が右の行から順に浮かぶ。
 * 4・5行目（古い墨）はごく薄く、読めないまま残る。第五話の `@演出 墨 続き`（院ができる前の古い灯晶の光）で、はっきり浮かぶ。
 */
export class InkWall extends THREE.Group {
  private columns: THREE.Mesh[] = [];
  private charm: Crystal;
  private light: THREE.PointLight;
  private glow: THREE.Sprite;
  private fading: Array<{ mesh: THREE.Mesh; to: number; t: number }> = [];

  constructor(envMap: THREE.Texture | null) {
    super();
    this.name = '墨';
    // 守り灯（壁の手前、胸の高さ）
    this.charm = new Crystal({ height: 0.16, envMap, sparkles: 6 });
    this.charm.position.set(0.7, 1.25, 0.75);
    this.charm.visible = false;
    this.add(this.charm);
    this.light = new THREE.PointLight('#ffd49a', 0, 4, 1.4);
    this.light.position.set(0.7, 1.35, 0.95);
    this.add(this.light);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffdca8', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.position.copy(this.charm.position);
    this.glow.scale.setScalar(0.001);
    this.add(this.glow);
    this.userData.camY = 1.5;
  }

  /** 行の板を作る（右から左へ並べ、上をそろえる） */
  private build(): void {
    const top = 2.5;
    COLUMNS.forEach((col, i) => {
      const n = [...col.text].length;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(CHAR, CHAR * n),
        new THREE.MeshBasicMaterial({ map: columnTexture(col.text, !!col.faint), transparent: true, opacity: 0, depthWrite: false, fog: false }),
      );
      mesh.position.set(0.45 - i * CHAR * 1.35, top - (CHAR * n) / 2, 0.02);
      mesh.renderOrder = 3;
      this.add(mesh);
      this.columns.push(mesh);
    });
  }

  async cue(signal: string): Promise<void> {
    if (signal !== '浮かぶ' && signal !== '続き') return;
    if (!this.columns.length) this.build();
    this.charm.visible = true;
    this.charm.ignite();
    this.light.intensity = 3.5;
    this.glow.scale.setScalar(0.9);
    const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
    if (signal === '続き') {
      // 読めた半分はもう見えている。古い墨の行が、古い灯晶の光で金色に浮かぶ
      this.light.intensity = 4.5;
      COLUMNS.forEach((c, i) => {
        if (!c.faint) (this.columns[i].material as THREE.MeshBasicMaterial).opacity = 1;
      });
      await wait(0.6);
      for (let i = 0; i < COLUMNS.length; i++) {
        if (!COLUMNS[i].faint) continue;
        this.columns[i].material = new THREE.MeshBasicMaterial({ map: columnTexture(COLUMNS[i].text, false), transparent: true, opacity: 0, depthWrite: false, fog: false });
        this.fading.push({ mesh: this.columns[i], to: 1, t: 0 });
        await wait(0.7);
      }
      await wait(0.4);
      return;
    }
    await wait(0.5);
    for (let i = 0; i < this.columns.length; i++) {
      this.fading.push({ mesh: this.columns[i], to: COLUMNS[i].faint ? 0.14 : 1, t: 0 });
      await wait(0.55);
    }
    await wait(0.4);
  }

  update(dt: number): void {
    if (this.charm.visible) this.charm.update(dt);
    for (const f of this.fading) {
      f.t = Math.min(1, f.t + dt / 0.9);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = f.to * f.t;
    }
    this.fading = this.fading.filter((f) => f.t < 1);
  }
}
