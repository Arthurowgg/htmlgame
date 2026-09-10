export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.just = new Set();
    this.mx = 0; this.my = 0;
    this.mdx = 0; this.mdy = 0;
    this.buttons = new Set();
    this.locked = false;
    this.touch = { active: false, lx: 0, ly: 0, jx: 0, jy: 0, jump: false, atk: false, act: false };
    this._bind(target);
  }

  _bind(t) {
    t.addEventListener('keydown', e => {
      const k = e.code;
      if (!this.keys.has(k)) this.just.add(k);
      this.keys.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    });
    t.addEventListener('keyup', e => this.keys.delete(e.code));
    t.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    const el = document.getElementById('stage') || document.body;
    el.addEventListener('mousedown', e => {
      this.buttons.add(e.button);
      if (e.button === 0 && !this.locked) this.requestLock(el);
    });
    el.addEventListener('mouseup', e => this.buttons.delete(e.button));
    document.addEventListener('mousemove', e => {
      if (this.locked) {
        this.mdx += e.movementX || 0;
        this.mdy += e.movementY || 0;
      }
      this.mx = e.clientX; this.my = e.clientY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement != null;
    });

    // touch stick
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (stick) {
      const sync = (ev) => {
        const r = stick.getBoundingClientRect();
        const tch = ev.changedTouches ? ev.changedTouches[0] : ev;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = (tch.clientX - cx) / (r.width / 2);
        let dy = (tch.clientY - cy) / (r.height / 2);
        const m = Math.hypot(dx, dy) || 1;
        if (m > 1) { dx /= m; dy /= m; }
        this.touch.jx = dx; this.touch.jy = dy; this.touch.active = true;
        if (knob) {
          knob.style.transform = `translate(${dx * 28}px, ${dy * 28}px)`;
        }
      };
      const end = () => {
        this.touch.jx = 0; this.touch.jy = 0; this.touch.active = false;
        if (knob) knob.style.transform = 'translate(0,0)';
      };
      stick.addEventListener('touchstart', e => { e.preventDefault(); sync(e); }, { passive: false });
      stick.addEventListener('touchmove', e => { e.preventDefault(); sync(e); }, { passive: false });
      stick.addEventListener('touchend', end);
      stick.addEventListener('touchcancel', end);
    }
    const bindBtn = (id, key) => {
      const b = document.getElementById(id);
      if (!b) return;
      const on = e => { e.preventDefault(); this.touch[key] = true; this.just.add('Touch' + key); };
      const off = () => { this.touch[key] = false; };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off);
      b.addEventListener('mousedown', on);
      b.addEventListener('mouseup', off);
    };
    bindBtn('btn-jump', 'jump');
    bindBtn('btn-atk', 'atk');
    bindBtn('btn-act', 'act');

    // show touch on coarse pointers
    if (window.matchMedia('(pointer: coarse)').matches) {
      document.getElementById('touch')?.classList.remove('hidden');
    }
  }

  requestLock(el) {
    try { (el || document.body).requestPointerLock?.(); } catch {}
  }

  pressed(code) { return this.keys.has(code); }
  down(code) { return this.just.has(code); }
  consume() { this.just.clear(); this.mdx = 0; this.mdy = 0; }

  moveVec() {
    let x = 0, z = 0;
    if (this.pressed('KeyW') || this.pressed('ArrowUp')) z -= 1;
    if (this.pressed('KeyS') || this.pressed('ArrowDown')) z += 1;
    if (this.pressed('KeyA') || this.pressed('ArrowLeft')) x -= 1;
    if (this.pressed('KeyD') || this.pressed('ArrowRight')) x += 1;
    x += this.touch.jx;
    z += this.touch.jy;
    const m = Math.hypot(x, z);
    if (m > 1) { x /= m; z /= m; }
    return [x, z];
  }

  jump() { return this.down('Space') || this.touch.jump || this.down('Touchjump'); }
  attack() { return this.down('KeyF') || this.down('KeyJ') || this.buttons.has(0) || this.down('Touchatk'); }
  act() { return this.down('KeyE') || this.down('Touchact'); }
  map() { return this.down('KeyM'); }
  questLog() { return this.down('KeyQ'); }
  pause() { return this.down('Escape') || this.down('KeyP'); }
}
