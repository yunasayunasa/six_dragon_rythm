import { escapeHtml } from '../../engine/ui/Hud';

export type TestimonyAction = 'prev' | 'next' | 'press' | 'present';

/** 対決の証言パネル（◀▶で証言を切り替え、「問いただす」「証拠を示す」） */
export class TestimonyPanel {
  readonly root: HTMLElement;
  private stmt: HTMLElement;
  private tag: HTMLElement;
  private text: HTMLElement;
  private dots: HTMLElement;
  private resolver: ((a: TestimonyAction) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'testimony hidden';
    this.root.innerHTML = `
      <div class="stmt washi"><div class="tag"></div><div class="nav prev">◀</div><div class="t"></div><div class="nav next">▶</div><div class="dots"></div></div>
      <div class="actions"><div class="btn" data-a="press">問いただす</div><div class="btn shu" data-a="present">証拠を示す</div></div>`;
    parent.appendChild(this.root);
    this.stmt = this.root.querySelector('.stmt')!;
    this.tag = this.root.querySelector('.tag')!;
    this.text = this.root.querySelector('.t')!;
    this.dots = this.root.querySelector('.dots')!;
    this.root.querySelector('.prev')!.addEventListener('click', () => this.fire('prev'));
    this.root.querySelector('.next')!.addEventListener('click', () => this.fire('next'));
    this.root.querySelectorAll<HTMLElement>('.actions .btn').forEach((b) => b.addEventListener('click', () => this.fire(b.dataset.a as TestimonyAction)));
  }

  show(title: string, text: string, index: number, total: number): void {
    this.root.classList.remove('hidden');
    this.tag.textContent = `${title}　その${index + 1}`;
    this.text.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
    this.dots.innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('');
    this.stmt.animate([{ transform: 'translateX(14px)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  wait(): Promise<TestimonyAction> {
    return new Promise((r) => (this.resolver = r));
  }

  get waiting(): boolean {
    return this.resolver !== null;
  }

  fire(a: TestimonyAction): void {
    const r = this.resolver;
    this.resolver = null;
    r?.(a);
  }
}
