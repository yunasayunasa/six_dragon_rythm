# 素材

ゲームで使う素材は `public/assets/` にあり、`tools/prepare_assets.py` で作ります（元ファイルは変更しません）。

| 出力 | 元素材（コウセイ/総合アセット） | 処理 |
|---|---|---|
| `cast/<ポーズ>/base.webp` ほか目口パーツ | `ADV_目口パーツ_20ポーズ_修正版` | 透明余白を切り詰め、72%に縮小、紙の白フチを焼き込み。`manifest.json` に立ち位置（中央・足元）とパーツ位置を記録 |
| `props/*.webp` | `Billboard_Assets_55` / `Cross_Plane_Priority12` / `HD2D_Decals_Priority18` | 切り詰め・縮小・白フチ |
| `stage/cloudsea.webp` | `Billboard_Assets_55/54_window_outside_cloudsea.png` | 空の帯を切り出し（色は実行時にLookで夕景・対決色へ変える） |
| `stage/wood.webp` | GitHub `main` の `assets/ground/wood.png` | 縮小、彩度を下げて明るく |
| `audio/bgm_harbor.mp3` | `音声/stage_bgm1.mp3` | 112kbpsへ再圧縮 |

```sh
python tools/prepare_assets.py <素材を展開したフォルダ> public/assets <wood.pngのあるフォルダ>
```

追加の立ち絵（攻撃3コマ・被弾・ガレヲンの微笑み／投げキッスなど、`ADV_attack_damage_galleon_additions.zip`）は、
Python が無い環境でも動く Node 版で変換しています（処理内容は上と同じ。`manifest.json` に追記）。

```sh
npm i --no-save sharp
node tools/prepare_poses.mjs <追加素材を展開したフォルダ> public/assets
```

- 攻撃・被弾の絵はすべて画面右向き。足元は `motion_layout.json` の `ground_y` にそろえる
- ガレヲンはいつも目を閉じたキャラなので、目のパーツ（まばたき）は無い

## 第一話の専用素材（2026-10-02、Codex の画像生成で制作）

素材リスト（Google スプレッドシート「第一話 素材リスト」）の絵は、Codex（gpt-6-astra の画像生成）で作り、`tools/prepare_props.mjs` で変換しています。
元の PNG と依頼文は `コウセイ\asset-work\case01-materials\`（`PROMPT.md` / `out/` / `out/REPORT.md`）にあります（リポジトリ外）。

| 出力 | 使いどころ | 変換 |
|---|---|---|
| `props/evidence_*.webp`（map・wrapper・footprints・ribbon・honey_puddle） | 証拠品の絵 | 長辺512（見取り図は640）・白フチ |
| `props/lighthouse_pillar.webp` | 灯台柱（`billboard: 'y'`。台座の上面が灯晶の高さ 2.16 に来る大きさ 2.3） | 長辺1024・白フチ |
| `props/notice_board.webp` ＋ `evidence_map.webp` | 無地の掲示板に見取り図を重ねて貼る | 白フチ |
| `props/fediel_table.webp` / `rope_ribbon.webp` / `fishing_gear.webp` | フェディエルの台・リボンの引っかかった係留ロープ・釣り道具 | 白フチ（ロープは `--despeckle`） |
| `props/footprints_trail.webp` | 床に寝かせる濡れた足跡（2枚つなぎ） | `--no-edge` |
| `stage/cloudsea_sunset.webp` / `stage/pier_planks.webp` | 背景の夕焼けの雲海・床板 | `--plain`（床板は彩度0.55・明るさ1.18） |
| `ui/title_logo.webp` / `ui/cover_case01.webp` | ホーム画面のロゴ・第一話の扉絵 | ロゴは白フチ、扉絵は `--plain` |
| `public/icon-512.png` / `icon-180.png` | ホーム画面に追加したときのアイコン | `--plain` |

```sh
node tools/prepare_props.mjs <元PNG> public/assets/props/<名前>.webp --max 768
```

前の `stage/cloudsea.webp`・`stage/wood.webp` と流用していた小物の絵は、第二話以降で使えるよう残しています。

効果音は素材ファイルを使わず、WebAudioで合成しています（`src/engine/audio/Sound.ts`）。
立ち絵はAI生成の差分のため、手指や装飾の細部はポーズ間で完全には一致しません。

## 声（フルボイス）

セリフの声は Gemini TTS で作っています（`tools/voices.mjs`。APIキーは `.env` の `GEMINI_API_KEY`）。

```sh
npm i --no-save @breezystack/lamejs
node tools/voices.mjs list                 # セリフ数と料金の目安
node tools/voices.mjs design [名前...]     # キャラの声を作る（作り直す）
node tools/voices.mjs generate [名前...]   # 作っていない・変わったセリフだけ声を作る
```

- 出力は `public/assets/voice/<話のid>/`（MP3 と、声のあるセリフの一覧 `index.json`）
- 台本のセリフを直したら `generate` を実行する（直した行だけ作り直す。消えた行の声は片付ける）
- 声の説明・行ごとの話し方・読み方の辞書はツールの冒頭（`CAST_VOICES` / `STYLE` / `READINGS`）

## 第二話の専用素材（2026-10-04、Codex の画像生成で制作）

依頼文と元の PNG は `コウセイ\asset-work\case02-materials\`（`PROMPT.md` / `out/` / `out/REPORT.md`）。Codex CLI に `codex exec --skip-git-repo-check -s workspace-write -C <フォルダ> - < PROMPT.md` で依頼した。
決まった意匠（どの絵でも同じにする）: 灯晶＝縦長の六角柱の琥珀色の結晶／商会の前掛け＝深緑に金の天秤／**灯晶院の紋＝円の中に結晶と3本の光、円の右下が欠けている**（第五話で院長の印と照らし合わせる）。

| 出力 | 使いどころ | 変換 |
|---|---|---|
| `props/evidence_*.webp`（box_crystal・floor_crystal・painting・letter・cart_ledger・seal） | 証拠品の絵 | 長辺512・白フチ |
| `props/market_pedestal.webp` | 市場灯の台座（高さ2.5。灯籠の箱の中心＝高さの8割に結晶を置く） | 長辺1024 |
| `props/stall_cotton.webp` / `stall_fruit.webp` / `paintbox.webp` / `shop_sign.webp` / `crates_market.webp` / `bunting.webp` | 広場の屋台・画材箱・商会の看板・荷・旗飾り | 白フチ |
| `props/office_desk.webp` / `key_rack.webp` / `office_wall.webp` | 帳場の机・鍵掛け・奥の壁（壁は `--plain` で2枚並べる） | 机は背景がマゼンタ寄りなので `--despeckle` |
| `props/lift_cage.webp` / `handcart.webp` | 昇降籠・トマの荷車 | 白フチ |
| `stage/market_town.webp` / `lift_sky.webp` | 広場・乗り場の背景（`backdrop.raw`＝色を空へ寄せず流さない） | `--plain --max 2048` |
| `stage/market_stone.webp` / `office_floor.webp` | 広場の石畳・帳場の床 | 継ぎ目が残ったので、左右・上下に反転して2×2に並べてつなげた |
| `ui/cover_case02.webp` | 第二話の扉絵 | `--plain --max 960` |

## 第三話の専用素材（2026-10-04、Codex の画像生成で制作）

依頼文と元の PNG は `コウセイ\asset-work\case03-materials\`（`PROMPT.md` / `out/` / `out/REPORT.md`）。依頼のしかたは第二話と同じ。
決まった意匠: 灯晶は第二話と同じ。**第三話の灯晶院の紋は欠けていない円**（欠けは第二話の封蝋＝院長の印だけの特徴。検品所の紋で「欠けているのは印の方」と気づかせる）。
霧そのものは絵に描かせず、コードで重ねる（`src/game/props/Mist.ts`）。墨の伝言の金色の文字もコードで描く（`src/game/props/InkWall.ts`、筆文字の書体）。

| 出力 | 使いどころ | 変換 |
|---|---|---|
| `props/evidence_*.webp`（lock・night_log・order_slip・charm・report・ink_message） | 証拠品の絵 | 長辺512・白フチ |
| `props/workbench.webp` / `test_bell.webp` / `workshop_shelf.webp` / `workshop_door.webp` / `crates_workshop.webp` | 工房の作業台・試し鐘・棚・外した戸・資材 | 白フチ |
| `props/workshop_wall.webp` / `inspect_wall.webp` | 工房・検品所の奥の壁（中央と左右に3枚並べる。工房の壁の中央に墨の伝言） | `--plain --max 2048` |
| `props/street_lamp.webp` / `watch_post.webp` / `fog_house.webp` | 通りの街灯・夜警の詰め所・家 | 街灯は背景がマゼンタ寄りなので `--despeckle` |
| `props/bell_tower.webp` | 鐘楼（凍った綱・つらら） | 長辺1024 |
| `props/crystal_cabinet.webp` / `inspect_desk.webp` / `emblem_banner.webp` | 検品所の灯晶の棚・検品台（水時計）・紋の垂れ幕 | 棚は `--despeckle` |
| `stage/fog_town.webp` / `tower_view.webp` | 背景（霧の町・鐘楼からの眺め。`backdrop.raw`） | `--plain --max 2048` |
| `stage/fog_cobble.webp` / `workshop_floor.webp` / `inspect_floor.webp` | 通り・鐘楼の石畳、工房の床、検品所の床 | 石畳と工房の床は継ぎ目が残ったので、反転して2×2に並べた（繰り返し回数は半分） |
| `ui/cover_case03.webp` | 第三話の扉絵 | `--plain --max 960` |

立ち絵（`tools/prepare_cast56.mjs`）: kagachi(35 ハーゼリーラ)・gen(15 ウーノ)・nio(18)・makira(2)・cagliostro(41)・clarice(42)・watchman(45 帝国兵。兜で目と口のパーツは無し)。
追加（公開後の所見）: `props/evidence_perfume.webp`（カガチの香水。`case03-materials/add1/`）。カリオストロの目・口は自動の切り出しが髪まで含んでずれたので、
`node tools/prepare_cast56.mjs <フォルダ> public/assets 41:cagliostro:eye=596,332,784,398:mouth=672,406,738,450` と手で四角を指定して作り直した。

## 第四話・第五話の専用素材（2026-10-05、Codex の画像生成で制作。ユーザー外出中）

依頼文と元の PNG は `コウセイ\asset-work\case04-materials\` と `case05-materials\`。変換は第三話と同じ（小物は `--despeckle`、証拠品は長辺512、壁・背景は `--plain --max 2048`、床は反転して2×2に並べてつなぎ目を消した）。
第四話の Codex は25点を描き終えたところで利用上限に達し、報告書（REPORT.md）だけ書けなかった（絵はすべてそろっている）。

| 話 | 出力 |
|---|---|
| 第四話 | 証拠品 `evidence_{patrol_log,key_record,rope,fur,cargo_ledger,visit_record,old_knot,float}`／小物 `ship_mast` `deck_crates` `barrels` `hanging_lantern` `cell_bars` `guard_desk` `key_cabinet` `visit_table` `hold_furnace` `inst_crate`／壁 `corridor_wall` `visit_wall` `hold_wall`（3枚並べる）／`stage/storm_sky` `deck_planks` `ship_floor`／`ui/cover_case04` |
| 第五話 | 証拠品 `evidence_{burnt_order,delivery_note,pier_log,seal_match,first_crystal,pier_light}`（封蝋のかけらは第二話の `evidence_seal`）／小物 `council_podium` `council_bench`／壁 `council_wall`／`stage/night_sky` `council_floor`（白と紺の市松。目立つので床の色で沈めた）／`ui/cover_case05` |

第五話の雲市場・霧の工房・凪ノ桟橋は、第二話・第三話・第一話の素材をそのまま使う。
