import * as THREE from 'three';

/** 画像・JSONの読み込みとキャッシュ。パスは public/assets からの相対。 */
export class Assets {
  private textures = new Map<string, Promise<THREE.Texture>>();
  private json = new Map<string, Promise<unknown>>();
  private loader = new THREE.TextureLoader();
  readonly base: string;
  maxAnisotropy = 4;

  constructor(base = `${import.meta.env.BASE_URL}assets/`) {
    this.base = base;
  }

  url(path: string): string {
    return this.base + path;
  }

  texture(path: string, opts: { repeat?: boolean; srgb?: boolean } = {}): Promise<THREE.Texture> {
    const key = `${path}|${opts.repeat ? 'r' : ''}`;
    let p = this.textures.get(key);
    if (!p) {
      p = this.loader.loadAsync(this.url(path)).then((t) => {
        t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        t.anisotropy = this.maxAnisotropy;
        if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        return t;
      });
      this.textures.set(key, p);
    }
    return p;
  }

  getJSON<T>(path: string): Promise<T> {
    let p = this.json.get(path);
    if (!p) {
      p = fetch(this.url(path)).then((r) => {
        if (!r.ok) throw new Error(`読み込み失敗: ${path} (${r.status})`);
        return r.json();
      });
      this.json.set(path, p);
    }
    return p as Promise<T>;
  }
}
