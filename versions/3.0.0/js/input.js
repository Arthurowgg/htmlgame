/**
 * Robust input — works without pointer lock, focuses canvas, tracks keys by code+key.
 */
export class Input {
  constructor() {
    this.keys = Object.create(null);
    this.just = Object.create(null);
    this.mdx = 0; this.mdy = 0;
    this.mx = 0; this.my = 0;
    this.buttons = Object.create(null);
    this.locked = false;
    this.lookActive = false; // RMB or lock
    this.touch = { jx: 0, jy: 0, jump: false, atk: false, act: false, lookx: 0, looky: 0 };
    this._bind();
  }

  _bind() {
    const down = (e) => {
      const codes = [e.code, e.key, e.key?.toLowerCase()].filter(Boolean);
      for (const c of codes) {
        if (!this.keys[c]) this.just[c] = true;
        this.keys[c] = true;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const up = (e) => {
      const codes = [e.code, e.key, e.key?.toLowerCase()].filter(Boolean);
      for (const c of codes) delete this.keys[c];
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.buttons = Object.create(null); });

    const stage = () => document.getElementById('stage') || document.body;

    document.addEventListener('mousedown', (e) => {
      this.buttons[e.button] = true;
      if (e.button === 2) this.lookActive = true;
      // left click: try pointer lock for FPS feel
      if (e.button === 0) {
        const el = stage();
        el.focus?.();
        try { el.requestPointerLock?.(); } catch {}
      }
    });
    document.addEventListener('mouseup', (e) => {
      delete this.buttons[e.button];
      if (e.button === 2) this.lookActive = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      this.mx = e.clientX; this.my = e.clientY;
      const locked = !!document.pointerLockElement;
      this.locked = locked;
      if (locked || this.lookActive || this.buttons[2]) {
        this.mdx += e.movementX || 0;
        this.mdy += e.movementY || 0;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = !!document.pointerLockElement;
    });

    // touch stick + look pad
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (stick) {
      const sync = (ev) => {
        const r = stick.getBoundingClientRect();
        const t = ev.changedTouches ? ev.changedTouches[0] : ev;
        let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const m = Math.hypot(dx, dy) || 1;
        if (m > 1) { dx /= m; dy /= m; }
        this.touch.jx = dx; this.touch.jy = dy;
        if (knob) knob.style.transform = `translate(${dx * 28}px,${dy * 28}px)`;
      };
      const end = () => {
        this.touch.jx = 0; this.touch.jy = 0;
        if (knob) knob.style.transform = 'translate(0,0)';
      };
      stick.addEventListener('touchstart', e => { e.preventDefault(); sync(e); }, { passive: false });
      stick.addEventListener('touchmove', e => { e.preventDefault(); sync(e); }, { passive: false });
      stick.addEventListener('touchend', end);
      stick.addEventListener('touchcancel', end);
    }
    // right half look
    let lookId = null, lastLX = 0, lastLY = 0;
    window.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX > window.innerWidth * 0.45 && lookId == null) {
          lookId = t.identifier; lastLX = t.clientX; lastLY = t.clientY;
        }
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookId) {
          this.mdx += (t.clientX - lastLX) * 1.6;
          this.mdy += (t.clientY - lastLY) * 1.6;
          lastLX = t.clientX; lastLY = t.clientY;
        }
      }
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    });

    const bindBtn = (id, key) => {
      const b = document.getElementById(id);
      if (!b) return;
      const on = (e) => { e.preventDefault(); this.touch[key] = true; this.just['Touch' + key] = true; };
      const off = () => { this.touch[key] = false; };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off);
      b.addEventListener('mousedown', on);
      b.addEventListener('mouseup', off);
    };
    bindBtn('btn-jump', 'jump');
    bindBtn('btn-atk', 'atk');
    bindBtn('btn-act', 'act');

    if (window.matchMedia('(pointer: coarse)').matches) {
      document.getElementById('touch')?.classList.remove('hidden');
    }
  }

  pressed(...codes) {
    for (const c of codes) if (this.keys[c]) return true;
    return false;
  }
  down(...codes) {
    for (const c of codes) if (this.just[c]) return true;
    return false;
  }
  consume() {
    this.just = Object.create(null);
    this.mdx = 0; this.mdy = 0;
  }

  /** Returns camera-relative wish dir on XZ, length <= 1 */
  moveVec() {
    let x = 0, z = 0;
    if (this.pressed('KeyW', 'w', 'W', 'ArrowUp')) z -= 1;
    if (this.pressed('KeyS', 's', 'S', 'ArrowDown')) z += 1;
    if (this.pressed('KeyA', 'a', 'A', 'ArrowLeft')) x -= 1;
    if (this.pressed('KeyD', 'd', 'D', 'ArrowRight')) x += 1;
    x += this.touch.jx;
    z += this.touch.jy;
    const m = Math.hypot(x, z);
    if (m > 1) { x /= m; z /= m; }
    return [x, z];
  }

  jump() { return this.down('Space', ' ') || this.touch.jump || this.down('Touchjump'); }
  attack() { return this.down('KeyF', 'f', 'F', 'KeyJ', 'j') || this.buttons[0] || this.down('Touchatk'); }
  act() { return this.down('KeyE', 'e', 'E') || this.down('Touchact'); }
  map() { return this.down('KeyM', 'm', 'M'); }
  inv() { return this.down('KeyI', 'i', 'I', 'Tab'); }
  questLog() { return this.down('KeyQ', 'q', 'Q'); }
  pause() { return this.down('Escape'); }
  sprint() { return this.pressed('ShiftLeft', 'ShiftRight', 'Shift'); }
}
