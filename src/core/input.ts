export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      const key = e.code;
      // prevent scrolling with arrows/space
      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Space') {
        e.preventDefault();
      }
      if (!this.down.has(key)) this.pressed.add(key);
      this.down.add(key);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
    });
  }

  isDown(code: string): boolean { return this.down.has(code); }
  wasPressed(code: string): boolean { return this.consume(this.pressed, code); }
  private consume(set: Set<string>, code: string): boolean {
    if (set.has(code)) { set.delete(code); return true; }
    return false;
  }
  updateFrame(): void {
    // clear per-frame pressed after each frame
    this.pressed.clear();
  }
}

