import * as THREE from 'three';
import { Director, Ease, PaperActor, CameraRig, type CastManifest, type Engine, type Mode, type Store } from '../../engine';
import { registerStageCommands, actorShot, twoShot } from '../../engine/script/stageCommands';
import { tagTexture } from '../../engine/paper/textures';
import type { PoseInfo } from '../../engine/paper/PaperActor';
import type { PortraitData } from '../../engine/ui/Portrait';
import type { CardItem } from '../../engine/ui/Hud';
import { CaseState, Confrontation, evaluateLogic } from './CaseState';
import { TestimonyPanel } from './TestimonyPanel';
import type { AreaDef, CaseData, GameOptions, HotspotDef, InvestigationSave, SceneDef, TutorialKey } from './types';

/** このジャンルが台本に追加する命令 */
export const INVESTIGATION_COMMANDS = ['give', 'flag', 'light', 'confront', 'challenge', 'solve', 'area'] as const;

type Phase = 'loading' | 'script' | 'explore' | 'done';

const WALK_SPEED = 2.9;
const PLAYER_RADIUS = 0.3;

/**
 * 逆転検事風ジャンルの実行部。
 * 捜査（歩いて調べる）・まとめる（手がかりをつなぐ／いつでも開ける）・尋問（証言に証拠をぶつける／何度でも）を行き来する。
 * 事件の中身は CaseData（データ）として外から渡す。
 */
export class InvestigationGame implements Mode {
  readonly state: CaseState;
  readonly director: Director;
  phase: Phase = 'loading';
  player!: PaperActor;
  private engine!: Engine;
  private markers = new Map<string, THREE.Sprite>();
  private near: HotspotDef | null = null;
  /** 近くの出入り口（行き先の場所の id） */
  private nearExit: AreaDef['exits'][number] | null = null;
  private exitMarkers: Array<{ sprite: THREE.Sprite; exit: AreaDef['exits'][number] }> = [];
  /** 場所（場所が1つの話では空） */
  private areas: AreaDef[] = [];
  /** いまいる場所の id（場所が1つの話では null） */
  area: string | null = null;
  private autoCamera = true;
  private stepClock = 0;
  private testimony!: TestimonyPanel;
  /** 会話の立ち絵に出ている役者（ポーズが変わったら立ち絵も差し替える） */
  private portraitActors: { left: PaperActor | null; right: PaperActor | null } = { left: null, right: null };
  /** 対決中の状態（自動確認用に公開） */
  confrontation: Confrontation | null = null;
  /** 頭上の印：まだ見ていない内容がある（！・話）／今の段階では調べ済み（赤い✓） */
  private tagTex = { look: tagTexture('！'), talk: tagTexture('話', '#3a2c6b'), done: tagTexture('✓', '#b8322a'), exit: tagTexture('移', '#2f6b4f') };
  /** テストや自動確認から進行を観察するためのログ */
  readonly log: string[] = [];
  /** この場で説明を聞き終えた場面（端末に残せない環境でも、同じ遊びの中では二度聞かない） */
  private tutorialsAsked = new Set<TutorialKey>();
  /** 説明を見せている間は、探索中でも操作を止める */
  private paused = false;

  constructor(readonly data: CaseData, private options: GameOptions = {}) {
    this.state = new CaseState(data);
    this.director = new Director({
      say: (s, e, t) => this.say(s, e, t),
      upcoming: (s, t) => this.engine.hud.preloadVoice(this.speakerName(s), t),
    });
  }

  // ---------- 準備 ----------
  async enter(engine: Engine): Promise<void> {
    this.engine = engine;
    this.registerCommands();
    await this.build();
    this.testimony = new TestimonyPanel(engine.hud.root);
    for (const [name, sel] of [['証言', '.stmt'], ['問いただす', '[data-a="press"]'], ['証拠を示す', '[data-a="present"]']] as const) {
      engine.hud.defineTarget(name, () => this.testimony.root.querySelector(sel));
    }
    engine.hud.bookButton.classList.remove('hidden');
    engine.hud.travelButton.classList.toggle('hidden', this.data.travel !== 'list');
    engine.hud.bookButton.addEventListener('click', () => {
      if (this.phase === 'explore' && !this.paused) void this.openBook();
    });
    engine.hud.menuButton.addEventListener('click', () => void this.openMenu());
  }

  /** いまいる場所の舞台 */
  private get sceneDef(): SceneDef {
    return this.area === null ? this.data.scene! : this.areaDef(this.area).scene;
  }

  /** 捜査中の見た目（場所ごとに決められる。省略時は夕景） */
  private get fieldLook(): string {
    return (this.area !== null ? this.areaDef(this.area).look : undefined) ?? 'sunset';
  }

  private areaDef(idOrName: string): AreaDef {
    const a = this.areas.find((x) => x.id === idOrName || x.name === idOrName);
    if (!a) throw new Error(`場所がありません: ${idOrName}`);
    return a;
  }

  private async build(): Promise<void> {
    const { engine, data } = this;
    const st = engine.stage;
    this.areas = data.areas ?? [];
    const first = this.areas[0]?.id ?? null;
    const manifest = await engine.assets.getJSON<CastManifest>('cast/manifest.json');
    // 場所ごとに舞台を組む（場所が1つの話は scene にそのまま）
    const builds: Array<{ id: string | null; sc: SceneDef }> = this.areas.length ? this.areas.map((a) => ({ id: a.id, sc: a.scene })) : [{ id: null, sc: data.scene! }];
    for (const { id, sc } of builds) {
      st.buildArea(id);
      await Promise.all([
        st.setBackdrop(sc.backdrop.image, sc.backdrop),
        st.addFloor(sc.floor.image, sc.floor),
        ...sc.props.map((p) => st.addProp(p)),
      ]);
      await sc.set?.(engine);
      st.addMotes(new THREE.Box3(new THREE.Vector3(-14, 0.2, -3), new THREE.Vector3(14, 4.5, 4)));
    }
    const actors = await Promise.all(data.cast.map((def) => PaperActor.load(def, manifest, engine.assets)));
    for (const a of actors) {
      const pl = data.placement.find((p) => p.id === a.def.id);
      st.buildArea(pl?.area ?? first);
      st.addActor(a, pl?.x ?? 0, pl?.z ?? 0, pl?.facing ?? 1);
      if (pl?.hidden) a.visible = false;
      // はじめから遺体の姿で置く（セーブから続けても同じ姿になる）
      if (pl?.corpse) a.corpse();
    }
    this.player = st.actor(data.player);
    // 声（public/assets/voice/<話のid>/。無ければ声なし）。叫びは主人公の声
    await engine.voices.load(engine.assets.url(`voice/${data.id}/`));
    engine.hud.shoutSpeaker = this.player.def.name;
    for (const a of actors) a.onPose = (who) => this.syncPortrait(who);
    engine.player = this.player;
    for (const h of data.hotspots) {
      // 奥行きを書く（書かないと被写界深度で奥の景色と一緒にぼかされ、霧に溶けて見えにくい）
      const mat = new THREE.SpriteMaterial({ map: h.actor ? this.tagTex.talk : this.tagTex.look, alphaTest: 0.5, transparent: true, fog: false });
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(0.42);
      const actor = h.actor ? st.actor(h.actor) : null;
      s.position.set(h.x, h.markHeight ?? (actor ? actor.def.height + 0.35 : 1.3), h.z);
      s.renderOrder = 5;
      (first === null ? st.scene : st.area(h.area ?? first)).add(s);
      this.markers.set(h.id, s);
    }
    // 出入り口の印
    for (const a of this.areas) {
      for (const exit of a.exits) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTex.exit, alphaTest: 0.5, transparent: true, fog: false }));
        s.scale.setScalar(0.42);
        s.position.set(exit.x, exit.markHeight ?? 1.3, exit.z);
        s.renderOrder = 5;
        st.area(a.id).add(s);
        this.exitMarkers.push({ sprite: s, exit });
      }
    }
    if (first === null) {
      st.buildArea(null);
      engine.rig.bounds = data.scene!.cameraBounds;
    } else this.showArea(first);
    engine.onFrame.add((dt) => this.animateMarkers(dt));
  }

  private registerCommands(): void {
    const d = this.director;
    registerStageCommands(d, {
      engine: this.engine,
      actor: (name) => this.findActor(name),
      resetCamera: () => this.followCamera(),
      setAutoCamera: (on) => (this.autoCamera = on),
    });
    // 証拠・手がかりを渡す
    d.register('give', async (args) => {
      for (const id of args) {
        if (!this.state.give(id)) continue;
        this.log.push(`give:${id}`);
        const ev = this.data.evidence.find((e) => e.id === id);
        if (ev) {
          this.engine.hud.hideDialogue();
          this.engine.stage.burst.fire(this.player.headPosition());
          await this.engine.hud.itemGet({ ...ev, image: this.engine.assets.url(ev.image) });
        } else {
          const c = this.data.clues.find((x) => x.id === id)!;
          this.engine.sound.play('select');
          this.engine.hud.hideDialogue();
          await this.engine.hud.itemGet({ id, name: c.name, desc: c.desc, image: this.engine.assets.url('props/sign_hanging_small.webp') }, '手がかりを書き留めた');
        }
      }
      this.refreshGoal();
    });
    d.register('flag', (args) => {
      args.forEach((f) => this.state.flags.add(f));
      this.refreshGoal();
    });
    // 灯り（舞台の名前付き光源）をつける/消す
    d.register('light', async (args) => {
      const obj = this.engine.stage.named.get(args[0]);
      const on = args[1] !== '消す' && args[1] !== 'off';
      const light = obj?.getObjectByProperty('isPointLight', true) as THREE.PointLight | undefined;
      if (!obj || !light) return;
      const glow = obj.getObjectByName('glow');
      const target = on ? Number(light.userData.on ?? 6) : 0;
      const from = light.intensity;
      obj.visible = true;
      // 立体の結晶などは、点灯の瞬間に強く光る
      if (on) {
        obj.traverse((o) => (o as { ignite?: () => void }).ignite?.());
        // 点灯の瞬間に金の火花が散る
        const at = obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.4, 0));
        this.engine.stage.spray.emit(at, { count: 50, color: '#ffd27a', spread: 1.6, up: 2.2, gravity: 2.2, size: 0.09, life: 1.4, glow: true });
      }
      await this.engine.tweens.run(1.2, (k) => {
        light.intensity = from + (target - from) * k;
        if (glow) glow.scale.setScalar((on ? k : 1 - k) * Number(glow.userData.size ?? 2.2) + 0.001);
      }, Ease.outCubic, light);
    });
    d.register('confront', (args) => this.runConfrontation(args[0]));
    d.register('challenge', (args) => this.runChallenge(args[0]));
    // @場所 名前 … その場所へ移る（舞台をたたんで組み直す）。@場所 名前 すぐ … 暗転中などに、すぐ切り替える
    d.register('area', (args) => this.goTo(args[0], { instant: args[1] === 'すぐ' || args[1] === 'now' }));
    d.register('solve', () => this.solve());
    for (const c of INVESTIGATION_COMMANDS) if (!d.has(c)) throw new Error(`命令の登録漏れ: ${c}`);
  }

  // ---------- 場所 ----------
  /** 見える場所をすぐに切り替える（カメラの範囲・見た目も合わせる） */
  private showArea(id: string): void {
    const a = this.areaDef(id);
    this.area = a.id;
    this.engine.stage.showArea(a.id);
    this.engine.rig.bounds = a.scene.cameraBounds;
    this.near = null;
    this.nearExit = null;
  }

  /**
   * 別の場所へ移る。紙の舞台を右からたたみ、行き先の舞台を左から組み立てる。
   * 着く所は、行き先にある「元の場所へ戻る出入り口」の少し内側（無ければ行き先の entry）
   */
  async goTo(idOrName: string, opts: { instant?: boolean } = {}): Promise<void> {
    const to = this.areaDef(idOrName);
    const st = this.engine.stage;
    const from = this.area;
    // もうその場所にいれば何もしない（まとめるの台本などで「この場所で行う」と書くため）
    if (from === to.id && !opts.instant) return;
    this.engine.hud.setPrompt(null);
    this.player.setWalking(0);
    if (!opts.instant) {
      this.engine.sound.play('paper');
      await st.fold();
    }
    // 持ち場ごとに主人公が替わる話では、行き先の主人公に持ち替える（前の主人公はその場所に残る）
    this.setPlayer(to.player ?? this.data.player);
    st.moveToArea(this.player, to.id);
    const back = to.exits.find((e) => e.to === from);
    if (back) {
      // 出入り口から舞台の中ほどへ1歩入った所に立ち、中を向く
      const inward = back.x > 0 ? -1 : 1;
      this.player.position.set(back.x + inward * 1.1, 0, back.z);
      this.player.faceInstant(inward);
    } else {
      this.player.position.set(to.entry.x, 0, to.entry.z);
      this.player.faceInstant(to.entry.facing);
    }
    this.player.visible = true;
    this.showArea(to.id);
    void st.setLook(this.fieldLook, 0.01);
    this.followCamera();
    this.engine.rig.snap();
    this.log.push(`area:${to.id}`);
    if (!opts.instant) {
      st.flattenAll();
      this.engine.sound.play('rise');
      await st.assemble();
      this.engine.hud.toast(to.name);
    }
  }

  /** 操作する人を替える（カメラ・叫びの声・会話の立ち絵の左側もその人になる） */
  private setPlayer(id: string): void {
    const next = this.engine.stage.actor(id);
    if (next === this.player) return;
    this.player.setWalking(0);
    this.player = next;
    this.engine.player = next;
    this.engine.hud.shoutSpeaker = next.def.name;
    this.log.push(`player:${id}`);
  }

  /** 今いる場所にあって、条件を満たしている調べる所か */
  private available(h: HotspotDef): boolean {
    if (this.area !== null && (h.area ?? this.areas[0].id) !== this.area) return false;
    return !h.when || this.state.check(h.when);
  }

  private findActor(name: string): PaperActor | null {
    const st = this.engine.stage;
    if (st.actors.has(name)) return st.actors.get(name)!;
    for (const a of st.actors.values()) if (a.def.name === name) return a;
    return null;
  }

  // ---------- 会話 ----------
  /** 台本の話し手（名前か id）を、表示する名前にする */
  private speakerName(speaker: string | null): string | null {
    return speaker ? (this.findActor(speaker)?.def.name ?? speaker) : null;
  }

  private async say(speaker: string | null, expr: string | null, text: string): Promise<void> {
    const actor = speaker ? this.findActor(speaker) : null;
    if (actor && expr) actor.setExpression(expr, false, this.engine.tweens);
    // 別の場所にいる人の台詞（声だけ届く）は、カメラを動かさない
    if (actor && this.autoCamera && this.engine.stage.isHere(actor)) {
      // 話し手と主人公が離れていなければ2人を収める
      if (actor !== this.player && actor.position.distanceTo(this.player.position) < 3.6) twoShot(this.engine.rig, this.player, actor);
      else actorShot(this.engine.rig, actor);
    }
    // 会話の立ち絵：主人公は左、相手は右
    if (actor) {
      const side = actor === this.player ? 'left' : 'right';
      this.portraitActors[side] = actor;
      this.engine.hud.setSpeaker(side, this.portraitOf(actor));
    } else this.engine.hud.setSpeaker(null, null);
    this.log.push(`say:${speaker ?? ''}:${text.slice(0, 12)}`);
    await this.engine.hud.say(actor?.def.name ?? speaker, actor?.def.color, text, (t) => {
      if (actor) actor.talking = t;
    });
  }

  /** 攻撃・被弾・表情の変化を、出ている会話の立ち絵にも反映する */
  private syncPortrait(actor: PaperActor): void {
    for (const side of ['left', 'right'] as const) {
      if (this.portraitActors[side] === actor) this.engine.hud.refreshPortrait(side, this.portraitOf(actor));
    }
  }

  private portraitOf(actor: PaperActor): PortraitData {
    const { id, info, artFacing } = actor.pose;
    const url = (file: string) => this.engine.assets.url(`cast/${id}/${file}`);
    const part = (k: keyof PoseInfo['parts']) => {
      const p = info.parts[k];
      return p ? { url: url(p.file), x: p.x, y: p.y, w: p.w, h: p.h } : undefined;
    };
    const pick = <T,>(o: Record<string, T | undefined>) =>
      Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Partial<Record<'open' | 'half' | 'closed', T>>;
    return {
      key: id,
      width: info.width,
      height: info.height,
      base: url('base.webp'),
      artFacing,
      eyes: pick({ open: part('eye_open'), half: part('eye_half'), closed: part('eye_closed') }),
      mouth: pick({ open: part('mouth_open'), half: part('mouth_half'), closed: part('mouth_closed') }),
      scale: actor.def.portraitScale,
    };
  }

  /** 台本を流す間は操作を止める */
  async runScript(source: string): Promise<void> {
    const prev = this.phase;
    this.phase = 'script';
    this.engine.hud.showTouch(false);
    this.engine.hud.setPrompt(null);
    this.player.setWalking(0);
    try {
      await this.director.play(source);
    } finally {
      this.engine.hud.hideDialogue();
      // 早送りは台本ごとに止める（次の台本まで持ち越さない）
      this.engine.hud.skipping = false;
      if (prev !== 'done' && this.phase === 'script') this.phase = prev === 'loading' ? 'explore' : prev;
    }
  }

  // ---------- 流れ ----------
  /** はじめから（導入の台本から）。save を渡すと、そのセーブの捜査の場面から続ける */
  async start(save?: InvestigationSave): Promise<void> {
    if (save) this.restore(save);
    void this.engine.stage.setLook(this.fieldLook, 0.01);
    this.followCamera();
    this.engine.rig.snap();
    if (this.data.bgm?.field) this.engine.sound.setBgm(this.data.bgm.field);
    this.engine.hud.menuButton.classList.remove('hidden');
    if (save) await this.engine.hud.card(this.data.title, this.data.chapter.replace(this.data.title, '').trim(), 'つづきから');
    else await this.runScript(this.data.intro);
    this.beginExplore();
    await this.offerTutorial('explore');
  }

  // ---------- セーブ・ロード ----------
  /** 今の進み具合（捜査中の状態）。尋問や会話の途中は残さない */
  snapshot(): InvestigationSave {
    const s = this.state;
    return {
      v: 1,
      evidence: [...s.evidence],
      clues: [...s.clues],
      flags: [...s.flags],
      seen: [...s.seen],
      talismans: s.talismans,
      actors: [...this.engine.stage.actors.values()].map((a) => ({ id: a.def.id, x: a.position.x, z: a.position.z, facing: a.facing, visible: a.visible, area: this.engine.stage.areaOf(a) ?? undefined })),
      area: this.area ?? undefined,
    };
  }

  private restore(save: InvestigationSave): void {
    const s = this.state;
    s.evidence.push(...save.evidence.filter((id) => this.data.evidence.some((e) => e.id === id)));
    s.clues.push(...save.clues.filter((id) => this.data.clues.some((c) => c.id === id)));
    save.flags.forEach((f) => s.flags.add(f));
    save.seen.forEach((k) => s.seen.add(k));
    s.talismans = save.talismans;
    for (const a of save.actors) {
      const actor = this.engine.stage.actors.get(a.id);
      if (!actor) continue;
      actor.position.set(a.x, 0, a.z);
      actor.faceInstant(a.facing);
      actor.visible = a.visible;
      if (a.area && this.areas.some((x) => x.id === a.area)) this.engine.stage.moveToArea(actor, a.area);
    }
    if (save.area && this.areas.some((x) => x.id === save.area)) {
      this.showArea(save.area);
      this.setPlayer(this.areaDef(save.area).player ?? this.data.player);
    }
    this.log.push('restore');
  }

  private save(slot: number): void {
    const goal = this.state.goal();
    this.engine.saves.write(slot, { game: this.data.id, savedAt: Date.now(), title: this.data.chapter, detail: goal ? `目的：${goal}` : '', data: this.snapshot() });
  }

  /** メニュー：セーブ（捜査中だけ）・ロード・ログ・設定・タイトルへ */
  private async openMenu(): Promise<void> {
    const hud = this.engine.hud;
    if (hud.modal > 0 || this.phase === 'loading' || this.phase === 'done') return;
    hud.sound.play('select');
    // メニューを開いている間（確認の問いかけを含む）は、会話も捜査も止める
    hud.modal++;
    try {
      await this.menuFlow(this.phase === 'explore' && !this.paused);
    } finally {
      hud.modal--;
      hud.input.clearPressed();
    }
  }

  private async menuFlow(canSave: boolean): Promise<void> {
    const hud = this.engine.hud;
    const items = [
      { id: 'save', label: 'セーブ', note: canSave ? '' : '捜査中（歩いて調べているとき）にセーブできます', disabled: !canSave },
      { id: 'load', label: 'ロード', disabled: !this.engine.saves.any || !this.options.load },
      { id: 'log', label: '会話のログ' },
      { id: 'settings', label: '設定' },
      { id: 'title', label: 'タイトルへ戻る', disabled: !this.options.toTitle },
    ];
    const i = await hud.panels.menu('メニュー', items);
    const id = i === null ? null : items[i].id;
    if (id === 'save') {
      const slot = await hud.panels.slots('save', this.engine.saves.list());
      if (slot === null) return;
      if (this.engine.saves.read(slot) && (await hud.choose(['上書きする', 'やめる'], `${slot}番に上書きしますか？`)) !== 0) return;
      this.save(slot);
      hud.sound.play('item');
      hud.toast(`${slot}番にセーブしました`);
    } else if (id === 'load') {
      const slot = await hud.panels.slots('load', this.engine.saves.list());
      if (slot === null) return;
      if ((await hud.choose(['ロードする', 'やめる'], '今の進み具合は残りません。ロードしますか？')) === 0) this.options.load?.(slot);
    } else if (id === 'log') await hud.panels.log();
    else if (id === 'settings') await hud.panels.settings(this.options.settingsExtras?.() ?? []);
    else if (id === 'title') {
      if ((await hud.choose(['戻る', 'やめる'], 'タイトルへ戻りますか？（オートセーブから続きを遊べます）')) === 0) this.options.toTitle?.();
    }
  }

  /** 説明を聞いた記録を消し、次にその場面を遊ぶときにまた聞くようにする */
  static resetTutorials(store: Store, game?: InvestigationGame | null): void {
    for (const k of ['explore', 'confront', 'logic'] as const) store.set(`tutorial:${k}`, false);
    game?.tutorialsAsked.clear();
  }

  /** その場面を初めて遊ぶときに、遊び方の説明を見るか聞く（答えたら、次からは聞かない） */
  private async offerTutorial(key: TutorialKey): Promise<void> {
    const t = this.options.tutorials?.[key];
    const store = this.engine.store;
    const storeKey = `tutorial:${key}`;
    if (!t || this.tutorialsAsked.has(key) || store.get(storeKey, false)) return;
    // 説明の間は歩いたり調べたりしない（調べる所の印は見せたままにする）
    this.paused = true;
    try {
      const yes = (await this.engine.hud.choose(['はい', 'いいえ'], t.question)) === 0;
      this.log.push(`tutorial:${key}:${yes ? 'yes' : 'no'}`);
      if (yes) await this.engine.hud.guide(t.steps);
      this.tutorialsAsked.add(key);
      store.set(storeKey, true);
    } finally {
      this.paused = false;
      this.engine.input.clearPressed();
    }
  }

  private beginExplore(): void {
    this.phase = 'explore';
    this.autoCamera = true;
    this.followCamera();
    this.engine.hud.showTouch(true);
    this.refreshGoal();
    // 捜査に戻るたびにオートセーブ
    this.save(0);
  }

  private followCamera(): void {
    this.engine.rig.followTarget(this.player, CameraRig.DEFAULT_OFFSET, 1.1, 32);
  }

  private refreshGoal(): void {
    this.engine.hud.setGoal(this.state.goal());
  }

  /** 証拠品（尋問でつきつける物） */
  private ownedEvidence(): CardItem[] {
    return this.state.evidence.map((id) => {
      const e = this.data.evidence.find((x) => x.id === id)!;
      return { ...e, image: this.engine.assets.url(e.image), group: '証拠品' };
    });
  }

  /** 推理メモ（まとめるで使う物） */
  private ownedClues(): CardItem[] {
    return this.state.clues.map((id) => {
      const c = this.data.clues.find((x) => x.id === id)!;
      return { ...c, image: this.engine.assets.url('props/sign_hanging_small.webp'), group: '推理メモ' };
    });
  }

  private async openBook(): Promise<void> {
    this.engine.hud.showTouch(false);
    await this.engine.hud.openBook([...this.ownedEvidence(), ...this.ownedClues()], 'view', '証拠品・推理メモ', '証拠品は尋問で、推理メモはまとめるで使う');
    if (this.phase === 'explore') this.engine.hud.showTouch(true);
  }

  private async interact(h: HotspotDef): Promise<void> {
    const { script: src, key } = this.state.resolveHotspot(h);
    this.state.markPlayed(key);
    this.log.push(`examine:${h.id}`);
    const actor = h.actor ? this.findActor(h.actor) : null;
    if (actor) {
      void actor.face(this.player.position.x >= actor.position.x ? 1 : -1, this.engine.tweens);
      void this.player.face(actor.position.x >= this.player.position.x ? 1 : -1, this.engine.tweens);
    } else {
      void this.player.face(h.x >= this.player.position.x ? 1 : -1, this.engine.tweens);
    }
    this.engine.sound.play('select');
    await this.runScript(src);
    if (this.phase === 'done') return;
    if (this.phase === 'explore' || this.phase === 'script') this.beginExplore();
  }

  /** まとめる：持っている手がかりから2つ選んでつなぐ。探索中ならいつでも開ける */
  async runLogic(): Promise<void> {
    const L = this.data.logic;
    const hud = this.engine.hud;
    this.phase = 'script';
    hud.showTouch(false);
    hud.setPrompt(null);
    this.player.setWalking(0);
    await this.engine.stage.setLook('confront', 0.6);
    // まとめ終わった推理メモ（使う組がすべて成立したもの）は一覧に出さない
    const used = (id: string) =>
      L.pairs.filter((p) => p.a === id || p.b === id).every((p) => this.state.flags.has(p.flag));
    const clues = this.ownedClues()
      .filter((c) => !used(c.id))
      .map(({ id, name, desc }) => ({ id, name, desc }));
    for (;;) {
      const opened = hud.logic(clues, L.title, L.hint);
      await this.offerTutorial('logic');
      const pick = await opened;
      if (!pick) break;
      const hit = evaluateLogic(this.data, pick[0], pick[1]);
      const nameOf = (id: string) => clues.find((c) => c.id === id)?.name ?? '';
      if (!hit || !this.state.flags.has(hit.flag)) await hud.logicLink(nameOf(pick[0]), nameOf(pick[1]), !!hit);
      if (hit && this.state.flags.has(hit.flag)) {
        await this.runScript(L.done);
        this.phase = 'script';
        continue;
      }
      if (hit) {
        this.log.push(`logic:${hit.flag}`);
        this.state.flags.add(hit.flag);
        await this.engine.stage.setLook(this.fieldLook, 0.8);
        await this.runScript(hit.script);
        break;
      }
      await this.runScript(L.miss);
      this.phase = 'script';
    }
    await this.engine.stage.setLook(this.fieldLook, 0.6);
    this.refreshGoal();
    // まとめた台本の中で尋問が始まり、事件が解決していることもある
    if (this.phase === 'script') this.beginExplore();
  }

  /** 尋問。台本の `@対決 <id>` から呼ばれ、正しい証拠をぶつけるまで続く */
  async runConfrontation(id: string): Promise<void> {
    const def = this.data.confrontations[id];
    if (!def) throw new Error(`尋問がありません: ${id}`);
    const hud = this.engine.hud;
    const witness = this.findActor(def.witness)!;
    const c = (this.confrontation = new Confrontation(def, this.state.talismans, this.data.talismans));
    const max = this.data.talismans;
    /** この尋問で間違えた回数（ヒントの強さに使う） */
    let misses = 0;
    this.phase = 'script';
    hud.showTouch(false);
    hud.setGoal(null);
    hud.bookButton.classList.add('hidden');
    this.log.push(`confront:${id}:start`);
    // 向かい合う立ち位置へ
    const side = witness.position.x >= this.player.position.x ? 1 : -1;
    const standX = witness.position.x - side * 2.4;
    await this.director.play(`@移動 ${this.player.def.id} ${standX.toFixed(2)} ${witness.position.z.toFixed(2)}`);
    await Promise.all([this.player.face(side as 1 | -1, this.engine.tweens), witness.face((-side) as 1 | -1, this.engine.tweens)]);
    await this.engine.stage.setLook('confront', 1);
    const bgm = def.bgm ?? this.data.bgm?.confront;
    if (bgm) this.engine.sound.setBgm(bgm);
    hud.setTalismans(max, c.talismans);
    await this.runScript(def.intro);
    await this.versus(witness, def.title, def.label);
    for (;;) {
      // 証言パネルが画面下半分を使うので、証人は上寄りに映す
      this.engine.rig.shot(witness.position.clone().add(new THREE.Vector3(0, -0.15, 0)), new THREE.Vector3(0.3 * witness.facing, 1.15, 5.6), 30);
      witness.talking = true;
      setTimeout(() => (witness.talking = false), 900);
      this.testimony.show(`${witness.def.name}の証言`, c.statement.text, c.index, c.visible.length);
      const voice = this.engine.voices.url(witness.def.name, c.statement.text);
      if (voice) this.engine.sound.playVoice(voice);
      await this.offerTutorial('confront');
      const a = await this.testimony.wait();
      if (voice) this.engine.sound.stopVoice();
      if (a === 'next' || a === 'prev') {
        this.engine.sound.play('select');
        if (a === 'next') c.next();
        else c.prev();
        continue;
      }
      this.testimony.hide();
      if (a === 'press') {
        const statement = c.statement;
        const revealed = c.press();
        this.log.push(`press:${id}:${c.number}`);
        await this.runScript(`@叫び ${this.data.shouts?.press ?? '待った！'}\n${statement.press}`);
        if (revealed !== null) {
          // 揺さぶりで新しい証言が出た：その証言へ移る
          this.engine.sound.play('reveal');
          c.index = c.visible.indexOf(revealed);
          await hud.card('証言が増えた', '', 'この証言をよく聞こう');
        }
        continue;
      }
      // 尋問でつきつけられるのは証拠品だけ（推理メモは「まとめる」用）
      const chosen = await hud.openBook(this.ownedEvidence(), 'present', '証拠品');
      if (!chosen) continue;
      const result = c.present(chosen);
      this.state.talismans = c.talismans;
      this.log.push(`present:${id}:${c.number}:${chosen}:${result}`);
      // 2人を収めてから、叫んで証拠品を投げつける
      twoShot(this.engine.rig, this.player, witness);
      await Promise.all([hud.shout(this.data.shouts?.present ?? 'これを見ろ！'), this.player.attack(this.engine.tweens)]);
      await this.throwEvidence(chosen, witness, result === 'correct');
      if (result === 'correct') {
        this.engine.rig.shake(0.4, 0.5);
        // 見破った一撃：相手のまわりに墨が飛び、金の火花が散る
        const at = witness.headPosition();
        this.engine.stage.spray.emit(at, { count: 26, color: '#1e1418', spread: 2.2, up: 1.6, gravity: 5, size: 0.12, life: 0.8 });
        this.engine.stage.spray.emit(at, { count: 30, color: '#ffcf7a', spread: 2.4, up: 2, gravity: 3, size: 0.08, life: 1, glow: true });
        await witness.damage(this.engine.tweens);
        await this.runScript(def.success);
        break;
      }
      this.engine.sound.play('wrong');
      // 相手に言い返される
      await witness.attack(this.engine.tweens);
      await this.player.damage(this.engine.tweens);
      hud.setTalismans(max, c.talismans);
      await this.runScript(def.wrong);
      misses++;
      if (c.lost) {
        // 信が尽きたらゲームオーバー。この尋問を始めたときの信に戻して、尋問の最初からやり直す（満タンには戻らない）
        await this.runScript(def.fail);
        this.log.push(`gameover:${id}`);
        this.engine.sound.play('wrong');
        await hud.card('ゲームオーバー', '信を失った', `この尋問の最初からやり直す（信 ${c.start}）`);
        c.reset();
        misses = 0;
        this.state.talismans = c.talismans;
        hud.setTalismans(max, c.talismans);
        await this.runScript(def.intro);
        await this.versus(witness, def.title, def.label);
        continue;
      }
      // 間違えるたびに、少しずつはっきりしたヒントを出す
      const hints = def.hints ?? [];
      if (hints.length) await this.runScript(hints[Math.min(misses, hints.length) - 1]);
    }
    this.confrontation = null;
    this.testimony.hide();
    hud.setTalismans(0, 0);
    this.log.push(`confront:${id}:solved`);
    // 成功の台本の中で事件が解決していれば、ここで終わり（台本の実行中に phase が変わる）
    if ((this.phase as Phase) === 'done') return;
    if (this.data.bgm?.field) this.engine.sound.setBgm(this.data.bgm.field);
    await this.engine.stage.setLook(this.fieldLook, 0.8);
    hud.bookButton.classList.remove('hidden');
    this.refreshGoal();
  }

  /** つきつけ。台本の `@つきつけ <id>` から呼ばれ、問いに答える証拠品を選ぶまで続く */
  async runChallenge(id: string): Promise<void> {
    const def = this.data.challenges?.[id];
    if (!def) throw new Error(`つきつけがありません: ${id}`);
    const hud = this.engine.hud;
    const witness = this.findActor(def.witness)!;
    const max = this.data.talismans;
    /** 信が尽きたら、ここまで戻す */
    const start = this.state.talismans;
    let misses = 0;
    // 尋問の成功の台本から続けて始まることもある（そのときは尋問の見た目・曲・立ち位置のまま）
    const inConfrontation = this.confrontation !== null;
    this.phase = 'script';
    hud.showTouch(false);
    hud.setGoal(null);
    hud.bookButton.classList.add('hidden');
    this.log.push(`challenge:${id}:start`);
    if (!inConfrontation) {
      const side = witness.position.x >= this.player.position.x ? 1 : -1;
      const standX = witness.position.x - side * 2.4;
      await this.director.play(`@移動 ${this.player.def.id} ${standX.toFixed(2)} ${witness.position.z.toFixed(2)}`);
      await Promise.all([this.player.face(side as 1 | -1, this.engine.tweens), witness.face((-side) as 1 | -1, this.engine.tweens)]);
      await this.engine.stage.setLook('confront', 1);
      if (this.data.bgm?.confront) this.engine.sound.setBgm(this.data.bgm.confront);
    }
    hud.setTalismans(max, this.state.talismans);
    const begin = () => this.versus(witness, def.title, 'つきつけ', '相手の問いに答える証拠品を選んで、つきつけよう');
    await begin();
    for (;;) {
      twoShot(this.engine.rig, this.player, witness);
      const chosen = await hud.openBook(this.ownedEvidence(), 'present', '証拠品', `問い：${def.question}`);
      if (!chosen) {
        // 選ばずに閉じたら、もう一度問われる
        await this.runScript(`${witness.def.id}「${def.question}」`);
        continue;
      }
      const ok = def.answer.includes(chosen);
      if (!ok) this.state.talismans = Math.max(0, this.state.talismans - 1);
      this.log.push(`present:${id}:${chosen}:${ok ? 'correct' : 'wrong'}`);
      await Promise.all([hud.shout(this.data.shouts?.present ?? 'これを見ろ！'), this.player.attack(this.engine.tweens)]);
      await this.throwEvidence(chosen, witness, ok);
      if (ok) {
        this.engine.rig.shake(0.4, 0.5);
        const at = witness.headPosition();
        this.engine.stage.spray.emit(at, { count: 26, color: '#1e1418', spread: 2.2, up: 1.6, gravity: 5, size: 0.12, life: 0.8 });
        this.engine.stage.spray.emit(at, { count: 30, color: '#ffcf7a', spread: 2.4, up: 2, gravity: 3, size: 0.08, life: 1, glow: true });
        await witness.damage(this.engine.tweens);
        this.log.push(`challenge:${id}:solved`);
        await this.runScript(def.success);
        break;
      }
      this.engine.sound.play('wrong');
      await witness.attack(this.engine.tweens);
      await this.player.damage(this.engine.tweens);
      hud.setTalismans(max, this.state.talismans);
      await this.runScript(def.wrong);
      misses++;
      if (this.state.talismans <= 0) {
        await this.runScript(def.fail);
        this.log.push(`gameover:${id}`);
        this.engine.sound.play('wrong');
        await hud.card('ゲームオーバー', '信を失った', `問いからやり直す（信 ${start}）`);
        this.state.talismans = start;
        misses = 0;
        hud.setTalismans(max, start);
        await begin();
        continue;
      }
      const hints = def.hints ?? [];
      if (hints.length) await this.runScript(hints[Math.min(misses, hints.length) - 1]);
    }
    // 尋問の中から始まったときは、後片づけは尋問の側で行う
    if (inConfrontation || (this.phase as Phase) === 'done') return;
    hud.setTalismans(0, 0);
    if (this.data.bgm?.field) this.engine.sound.setBgm(this.data.bgm.field);
    await this.engine.stage.setLook(this.fieldLook, 0.8);
    hud.bookButton.classList.remove('hidden');
    this.refreshGoal();
  }

  /** 尋問の始まり：主人公と証人が向かい合う対峙のカットイン */
  private versus(witness: PaperActor, title: string, label = '尋問開始', hint = '◀▶で証言を切り替え、揺さぶるか、矛盾に証拠品をつきつけよう'): Promise<void> {
    return this.engine.hud.versus(
      { portrait: this.portraitOf(this.player), color: this.player.def.color },
      { portrait: this.portraitOf(witness), color: witness.def.color },
      title,
      label,
      hint,
    );
  }

  /** 証拠品の紙の札（画像と名前）。一度作ったら使い回す */
  private cardTextures = new Map<string, Promise<THREE.Texture>>();
  private evidenceCard(id: string): Promise<THREE.Texture> {
    let p = this.cardTextures.get(id);
    if (!p) {
      const ev = this.data.evidence.find((e) => e.id === id)!;
      p = this.engine.assets.texture(ev.image).then((pic) => {
        const W = 256;
        const H = 330;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d')!;
        g.fillStyle = '#fffaf0';
        g.beginPath();
        g.roundRect(0, 0, W, H, 16);
        g.fill();
        g.fillStyle = '#f7efdc';
        g.fillRect(10, 10, W - 20, H - 20);
        g.strokeStyle = '#2b1d17';
        g.lineWidth = 4;
        g.strokeRect(16, 16, W - 32, H - 32);
        const img = pic.image as CanvasImageSource & { width: number; height: number };
        const box = 190;
        const s = Math.min(box / img.width, box / img.height);
        g.drawImage(img, (W - img.width * s) / 2, 30 + (box - img.height * s) / 2, img.width * s, img.height * s);
        g.fillStyle = '#2b1d17';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        let size = 30;
        do g.font = `bold ${size--}px 'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', 'Meiryo', sans-serif`;
        while (g.measureText(ev.name).width > W - 44 && size > 14);
        g.fillText(ev.name, W / 2, H - 58);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      });
      this.cardTextures.set(id, p);
    }
    return p;
  }

  /**
   * つきつけた証拠品の札が、主人公の手元から回転しながら相手へ飛ぶ。
   * 正しければ相手に突き刺さってしばらく残り、間違いなら弾かれて床へ落ちる
   */
  private async throwEvidence(id: string, witness: PaperActor, hit: boolean): Promise<void> {
    const tw = this.engine.tweens;
    const tex = await this.evidenceCard(id);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.645), new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    card.renderOrder = 3;
    this.engine.stage.scene.add(card);
    const from = this.player.headPosition().add(new THREE.Vector3(0.35 * this.player.facing, -0.25, 0.3));
    const to = witness.headPosition().add(new THREE.Vector3(0, -0.3, 0.25));
    this.engine.sound.play('paper');
    await tw.run(
      0.3,
      (k) => {
        card.position.lerpVectors(from, to, k);
        card.position.y += Math.sin(k * Math.PI) * 0.35;
        card.rotation.set(0, (1 - k) * Math.PI * 5, (1 - k) * 0.8);
        card.scale.setScalar(0.5 + 0.5 * k);
      },
      Ease.inQuad,
      card,
    );
    const remove = () => {
      this.engine.stage.scene.remove(card);
      card.geometry.dispose();
      (card.material as THREE.Material).dispose();
    };
    if (hit) {
      // ズバッと突き刺さる：少しめり込み、傾いたまま残って、あとで落ちる
      this.engine.sound.play('impact');
      card.rotation.set(0, 0, -0.18 * this.player.facing);
      void tw
        .run(0.12, (k) => (card.position.z = to.z - 0.08 * k), Ease.outCubic, card.position)
        .then(() => tw.wait(1.4))
        .then(() =>
          tw.run(0.5, (k) => {
            card.position.y = to.y - k * 1.0;
            card.rotation.x = (-Math.PI / 2) * k;
          }, Ease.inQuad, card.rotation),
        )
        .then(remove);
      return;
    }
    // ペシッと弾かれる：くるくる回りながら跳ね返って、床に落ちる
    this.engine.sound.play('cancel');
    const back = from.clone().lerp(to, 0.55);
    back.y = 0.04;
    const at = card.position.clone();
    await tw.run(
      0.45,
      (k) => {
        card.position.lerpVectors(at, back, k);
        card.position.y += Math.sin(k * Math.PI) * 0.5;
        card.rotation.set((-Math.PI / 2) * k, k * Math.PI * 3, 0);
      },
      Ease.linear,
      card,
    );
    void tw.wait(0.6).then(remove);
  }

  /** 事件解決：結末を流して最初から */
  async solve(): Promise<void> {
    const hud = this.engine.hud;
    this.state.flags.add('solved');
    this.log.push('solved');
    // 尋問・つきつけの中から解決したときも、信の札と証言は下げて結末を見せる
    hud.setTalismans(0, 0);
    this.testimony.hide();
    hud.bookButton.classList.add('hidden');
    hud.setGoal(null);
    await this.runScript(this.data.ending);
    this.phase = 'done';
    this.markers.forEach((m) => (m.visible = false));
    this.options.onSolved?.();
    this.engine.stage.confetti.fire(this.player.headPosition().add(new THREE.Vector3(0, 0.6, 0)), 110, 2.4);
    await hud.card('事件解決', this.data.chapter, 'タップでタイトルへ');
    if (this.options.toTitle) this.options.toTitle();
    else location.reload();
  }

  // ---------- 毎フレーム ----------
  update(dt: number, engine: Engine): void {
    if (this.phase !== 'explore' || this.paused || engine.hud.modal > 0) {
      this.player?.setWalking(0);
      return;
    }
    const inp = engine.input;
    const p = this.player;
    const mv = inp.move;
    const moving = Math.hypot(mv.x, mv.y) > 0.05;
    if (moving) {
      const nx = p.position.x + mv.x * WALK_SPEED * dt;
      const nz = p.position.z + mv.y * WALK_SPEED * 0.8 * dt;
      const pos = this.resolveCollision(nx, nz);
      p.position.x = pos.x;
      p.position.z = pos.y;
      if (Math.abs(mv.x) > 0.2) void p.face(mv.x > 0 ? 1 : -1, engine.tweens);
      this.stepClock -= dt;
      if (this.stepClock <= 0) {
        this.stepClock = 0.34;
        engine.sound.play('step');
        this.footstep(engine);
      }
    }
    p.setWalking(moving ? Math.min(1, Math.hypot(mv.x, mv.y) * 1.2) : 0);
    engine.stage.centerShadow(p.position.x);

    // 近くの調べられる所・出入り口
    let best: HotspotDef | null = null;
    let bestD = Infinity;
    for (const h of this.data.hotspots) {
      if (!this.available(h)) continue;
      const d = Math.hypot(h.x - p.position.x, h.z - p.position.z);
      if (d < h.radius && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    let exit: AreaDef['exits'][number] | null = null;
    if (this.area !== null) {
      for (const e of this.areaDef(this.area).exits) {
        const d = Math.hypot(e.x - p.position.x, e.z - p.position.z);
        if (d < e.radius && d < bestD) {
          exit = e;
          bestD = d;
        }
      }
    }
    if (exit) best = null;
    if (best !== this.near || exit !== this.nearExit) {
      this.near = best;
      this.nearExit = exit;
      if (exit) engine.hud.setPrompt(`${this.areaDef(exit.to).name}へ`, '移');
      else engine.hud.setPrompt(best ? best.label : null);
    }
    if (inp.consume('menu')) {
      void this.openBook();
      return;
    }
    if (inp.consume('logic')) {
      void this.runLogic();
      return;
    }
    if (inp.consume('travel') && this.listTravel) {
      void this.chooseArea();
      return;
    }
    if (this.nearExit && inp.consume('confirm')) {
      const e = this.nearExit;
      this.nearExit = null;
      void (this.listTravel ? this.chooseArea() : this.travel(e.to));
      return;
    }
    if (this.near && inp.consume('confirm')) {
      const h = this.near;
      this.near = null;
      void this.interact(h);
    }
  }

  /** 行き先をリストから選んで移る話か */
  private get listTravel(): boolean {
    return this.data.travel === 'list' && this.areas.length > 1;
  }

  /** 行き先をリストから選んで移る（捜査中の「移動」ボタン・出入り口から） */
  private async chooseArea(): Promise<void> {
    const others = this.areas.filter((a) => a.id !== this.area);
    this.phase = 'script';
    this.engine.hud.showTouch(false);
    this.engine.hud.setPrompt(null);
    this.player.setWalking(0);
    this.engine.sound.play('select');
    const i = await this.engine.hud.choose([...others.map((a) => a.name), 'やめる'], 'どこへ行く？');
    if (i < others.length) await this.goTo(others[i].id);
    this.beginExplore();
  }

  /** 出入り口から別の場所へ（探索中） */
  private async travel(to: string): Promise<void> {
    this.phase = 'script';
    this.engine.hud.showTouch(false);
    this.engine.sound.play('select');
    await this.goTo(to);
    this.beginExplore();
  }

  /** 足音に合わせて足元が反応する：ふだんは小さな土ぼこり、水たまりでは水しぶき */
  private footstep(engine: Engine): void {
    const p = this.player.position;
    const at = new THREE.Vector3(p.x, 0.05, p.z);
    const wet = this.sceneDef.wet?.some((w) => Math.hypot(w.x - p.x, w.z - p.z) < w.r);
    if (wet) engine.stage.spray.emit(at, { count: 16, color: '#eef8ff', spread: 1.1, up: 2, gravity: 7, size: 0.1, life: 0.6 });
    else engine.stage.spray.emit(at, { count: 3, color: '#c9a582', spread: 0.35, up: 0.35, gravity: 0.6, size: 0.1, life: 0.6 });
  }

  private resolveCollision(x: number, z: number): THREE.Vector2 {
    const w = this.sceneDef.walk;
    const v = new THREE.Vector2(THREE.MathUtils.clamp(x, w.minX, w.maxX), THREE.MathUtils.clamp(z, w.minZ, w.maxZ));
    const push = (cx: number, cz: number, r: number) => {
      const dx = v.x - cx;
      const dz = v.y - cz;
      const d = Math.hypot(dx, dz);
      const min = r + PLAYER_RADIUS;
      if (d < min && d > 1e-4) {
        v.x = cx + (dx / d) * min;
        v.y = cz + (dz / d) * min;
      }
    };
    for (const o of this.sceneDef.obstacles) push(o.x, o.z, o.r);
    const st = this.engine.stage;
    for (const a of st.actors.values()) if (a !== this.player && a.visible && st.isHere(a)) push(a.position.x, a.position.z, 0.32);
    return v;
  }

  private markerTime = 0;
  private animateMarkers(dt: number): void {
    this.markerTime += dt;
    for (const h of this.data.hotspots) {
      const m = this.markers.get(h.id)!;
      // 今の段階で新しく見られる内容があれば「！・話」、見終わっていれば赤い✓
      const done = !this.state.resolveHotspot(h).fresh;
      const mat = m.material as THREE.SpriteMaterial;
      const want = done ? this.tagTex.done : h.actor ? this.tagTex.talk : this.tagTex.look;
      if (mat.map !== want) {
        mat.map = want;
        mat.needsUpdate = true;
      }
      const base = h.markHeight ?? (h.actor ? (this.findActor(h.actor)?.def.height ?? 1) + 0.35 : 1.3);
      // 新しい内容がある印は大きく弾ませ、調べ済みは小さく静かに
      m.position.y = base + (done ? 0 : Math.abs(Math.sin(this.markerTime * 3 + h.x)) * 0.1);
      const isNear = this.near === h && this.phase === 'explore';
      m.scale.setScalar(isNear ? 0.52 : done ? 0.3 : 0.44);
      m.visible = this.phase === 'explore' && this.available(h);
    }
    for (const { sprite, exit } of this.exitMarkers) {
      sprite.position.y = (exit.markHeight ?? 1.3) + Math.sin(this.markerTime * 2 + exit.x) * 0.05;
      sprite.scale.setScalar(this.nearExit === exit && this.phase === 'explore' ? 0.52 : 0.4);
      sprite.visible = this.phase === 'explore';
    }
  }
}
