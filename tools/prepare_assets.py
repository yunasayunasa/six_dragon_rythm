"""総合アセットから、エンジン用の軽量素材を作る（開発用ツール。ゲーム実行には不要）。

使い方: python tools/prepare_assets.py <展開済み素材フォルダ> <出力先 public/assets>
- 立ち絵(base+目口パーツ): 透明余白を切り詰め、縮小し、紙の白フチを焼き込む
- 小物: 切り詰め・縮小・白フチ
- 背景: 雲海の帯を切り出す
元ファイルは変更しない。
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageFilter, ImageChops

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
PORTRAIT_SCALE = 0.72  # 1200px -> 864px。スマホのテクスチャ負荷を抑える
EDGE_PX = 7            # 紙の白フチ幅（縮小後のpx）


def paper_edge(img: Image.Image, width: int, color=(255, 253, 246)) -> Image.Image:
    """アルファを膨張させた白フチの上に元画像を重ねる。外周にごく薄い紙の影色も付ける。"""
    a = img.getchannel('A').point(lambda v: 255 if v > 24 else 0)
    grown = a.filter(ImageFilter.MaxFilter(width * 2 + 1)).filter(ImageFilter.GaussianBlur(0.8))
    rim = grown.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    rim_layer = Image.new('RGBA', img.size, (120, 104, 88, 0))
    rim_layer.putalpha(rim.point(lambda v: int(v * 0.55)))
    out = Image.alpha_composite(out, rim_layer)
    white = Image.new('RGBA', img.size, color + (0,))
    white.putalpha(grown)
    out = Image.alpha_composite(out, white)
    return Image.alpha_composite(out, img)


def pad(img: Image.Image, p: int) -> Image.Image:
    c = Image.new('RGBA', (img.width + p * 2, img.height + p * 2), (0, 0, 0, 0))
    c.paste(img, (p, p))
    return c


def save_webp(img: Image.Image, path: Path, q=88):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'WEBP', quality=q, method=6)


def portraits():
    root = SRC / 'ADV_目口パーツ_20ポーズ_修正版'
    manifest = {}
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        layout = json.loads((d / 'layout.json').read_text(encoding='utf-8'))
        base = Image.open(d / layout['master']).convert('RGBA')
        l, t, r, b = base.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
        foot_src = b
        margin = int(EDGE_PX / PORTRAIT_SCALE) + 6
        l, t = max(0, l - margin), max(0, t - margin)
        r, b = min(base.width, r + margin), min(base.height, b + margin)
        crop = base.crop((l, t, r, b))
        w, h = round(crop.width * PORTRAIT_SCALE), round(crop.height * PORTRAIT_SCALE)
        small = crop.resize((w, h), Image.LANCZOS)
        framed = paper_edge(small, EDGE_PX)
        save_webp(framed, OUT / 'cast' / d.name / 'base.webp')
        parts = {}
        for key, part in layout['parts'].items():
            pimg = Image.open(d / part['file']).convert('RGBA')
            pw, ph = max(1, round(pimg.width * PORTRAIT_SCALE)), max(1, round(pimg.height * PORTRAIT_SCALE))
            save_webp(pimg.resize((pw, ph), Image.LANCZOS), OUT / 'cast' / d.name / f'{key}.webp', q=92)
            parts[key] = {
                'file': f'{key}.webp',
                'x': round((part['x'] - l) * PORTRAIT_SCALE),
                'y': round((part['y'] - t) * PORTRAIT_SCALE),
                'w': pw, 'h': ph,
            }
        manifest[d.name] = {
            'width': w, 'height': h,
            # 元キャンバス中央(600px)と足元の位置。ポーズごとに切り詰め量が違っても立ち位置を揃えるため
            'cx': round((layout['canvas']['width'] / 2 - l) * PORTRAIT_SCALE),
            'foot': round((foot_src - t) * PORTRAIT_SCALE),
            'parts': parts,
        }
    (OUT / 'cast' / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    print('portraits', len(manifest))


PROPS = {
    'Billboard_Assets_55_Transparent_PNG': [
        '17_lamp_small', '19_sack_small', '21_shop_goods_bundle_A', '22_shop_goods_bundle_B',
        '25_small_box_goods', '27_food_bundle_shop', '31_banner_small_blue', '32_banner_small_red',
        '34_laundry_line_small', '35_sign_hanging_small', '36_sign_hanging_shop', '42_flower_patch_small',
        '45_small_rock_group', '49_crystal_small_cluster', '41_grass_small', '37_rope_hanging_small',
    ],
    'Cross_Plane_Priority12_Transparent_PNG': [
        '01_bush_large_A', '07_tree_medium_A', '05_tree_small_A', '10_grass_tall_A', '13_flower_bush_A',
        '26_rope_bundle_large', '16_rock_cluster_A',
    ],
}


def props():
    for folder, names in PROPS.items():
        for n in names:
            img = Image.open(SRC / folder / f'{n}.png').convert('RGBA')
            img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
            img.thumbnail((440, 440), Image.LANCZOS)
            img = paper_edge(pad(img, 10), 5)
            save_webp(img, OUT / 'props' / f'{n.split("_", 1)[1]}.webp')
    for n in ['D05_puddle', 'D04_dirt_stain']:
        img = Image.open(SRC / 'HD2D_Decals_Priority18' / 'Decals' / f'{n}.png').convert('RGBA')
        img = img.crop(img.getbbox())
        img.thumbnail((384, 384), Image.LANCZOS)
        save_webp(img, OUT / 'props' / f'{n.split("_", 1)[1]}.webp')
    print('props ok')


def backdrop():
    img = Image.open(SRC / 'Billboard_Assets_55_Transparent_PNG' / '54_window_outside_cloudsea.png').convert('RGB')
    img = img.crop((92, 172, 1586, 768)).resize((1536, 612), Image.LANCZOS)
    save_webp(img, OUT / 'stage' / 'cloudsea.webp', q=86)
    print('backdrop ok')


def ground(repo_assets: Path):
    from PIL import ImageEnhance
    img = Image.open(repo_assets / 'wood.png').convert('RGB').resize((512, 512), Image.LANCZOS)
    # 夕日の暖色が乗るので、板は彩度を落として明るめにしておく（赤くなりすぎない）
    img = ImageEnhance.Color(img).enhance(0.55)
    img = ImageEnhance.Brightness(img).enhance(1.18)
    save_webp(img, OUT / 'stage' / 'wood.webp', q=86)


if __name__ == '__main__':
    portraits()
    props()
    backdrop()
    ground(Path(sys.argv[3]))
