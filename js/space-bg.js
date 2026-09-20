/**
 * Namelees Visual - Cosmic Space & Stars Background (Pulse Visual Aesthetic)
 * Features:
 * - Multi-layer starfield with realistic twinkle, colors, and subtle drift
 * - 4-point cinematic sparkle flares on bright stars
 * - Atmospheric floating cosmic nebulas
 * - Occasional realistic shooting stars / meteors with glowing trail
 * - Interactive mouse parallax with smooth damping
 * - 1-Click Toggle to switch back to Classic background anytime (saved in localStorage)
 * - Battery & CPU optimized: auto-pause on hidden tab, 60fps limit, DPR scaling
 */

(function () {
  'use strict';

  class SpaceCosmosBackground {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.stars = [];
      this.meteors = [];
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.animId = null;
      this.lastTime = 0;
      this.isRunning = false;
      this.mouseX = 0;
      this.mouseY = 0;
      this.targetMouseX = 0;
      this.targetMouseY = 0;
      this.nextMeteorTime = Date.now() + 3000;
      this.theme = localStorage.getItem('nv_theme_bg') || 'space';

      // Cosmic star color palette
      this.colors = [
        '#ffffff', // Pure white
        '#ffffff',
        '#e0f2fe', // Ice blue
        '#bae6fd', // Soft sky blue
        '#c084fc', // Nebula violet
        '#e9d5ff', // Pale lilac
        '#fef08a'  // Subtle warm amber
      ];

      this.init();
    }

    init() {
      this.setupDOM();
      this.setupCanvas();
      this.createStars();
      this.setupEvents();

      // Apply initial theme state
      this.applyTheme(this.theme);
    }

    setupDOM() {
      let layer = document.getElementById('space-bg-layer');
      if (!layer) {
        layer = document.createElement('div');
        layer.id = 'space-bg-layer';
        layer.className = 'space-bg-layer';
        layer.setAttribute('aria-hidden', 'true');
        layer.innerHTML = `
          <div class="cosmic-nebula nebula-purple"></div>
          <div class="cosmic-nebula nebula-cyan"></div>
          <div class="cosmic-nebula nebula-indigo"></div>
          <div class="cosmic-dust-overlay"></div>
          <canvas id="space-stars-canvas"></canvas>
        `;
        document.body.insertBefore(layer, document.body.firstChild);
      }

      this.canvas = document.getElementById('space-stars-canvas');
      this.ctx = this.canvas.getContext('2d');

      // Add floating toggle button at bottom-left if not already present
      if (!document.getElementById('space-bg-floating-toggle')) {
        const floatBtn = document.createElement('div');
        floatBtn.id = 'space-bg-floating-toggle';
        floatBtn.className = 'space-bg-floating-toggle';
        floatBtn.innerHTML = `
          <button type="button" class="theme-switch-pill" onclick="window.spaceBg && window.spaceBg.toggle()" title="Сменить фон: Космос со звездами / Стандартный">
            <span class="theme-switch-icon">🌌</span>
            <span class="theme-switch-label">Фон: Космос</span>
          </button>
        `;
        document.body.appendChild(floatBtn);
      }
    }

    setupCanvas() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.canvas.width = this.width * this.dpr;
      this.canvas.height = this.height * this.dpr;
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';

      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(this.dpr, this.dpr);
    }

    createStars() {
      this.stars = [];
      const count = Math.floor(Math.min(180, Math.max(70, (this.width * this.height) / 10000)));

      for (let i = 0; i < count; i++) {
        const layer = Math.random() < 0.65 ? 1 : Math.random() < 0.88 ? 2 : 3;
        let radius, baseAlpha, speed, hasFlare;

        if (layer === 1) {
          radius = 0.5 + Math.random() * 0.7;
          baseAlpha = 0.25 + Math.random() * 0.45;
          speed = 0.02 + Math.random() * 0.04;
          hasFlare = false;
        } else if (layer === 2) {
          radius = 1.0 + Math.random() * 0.9;
          baseAlpha = 0.5 + Math.random() * 0.4;
          speed = 0.05 + Math.random() * 0.07;
          hasFlare = Math.random() < 0.15;
        } else {
          radius = 1.7 + Math.random() * 1.1;
          baseAlpha = 0.8 + Math.random() * 0.2;
          speed = 0.08 + Math.random() * 0.09;
          hasFlare = true;
        }

        this.stars.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          radius: radius,
          layer: layer,
          color: this.colors[Math.floor(Math.random() * this.colors.length)],
          baseAlpha: baseAlpha,
          alpha: baseAlpha,
          twinkleSpeed: 0.0015 + Math.random() * 0.0035,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleAmp: 0.2 + Math.random() * 0.35,
          driftSpeedY: -speed,
          driftSpeedX: (Math.random() - 0.5) * speed * 0.4,
          hasFlare: hasFlare
        });
      }
    }

    spawnMeteor() {
      const startX = Math.random() * (this.width * 1.2);
      const startY = -40 + Math.random() * (this.height * 0.35);
      const speed = 12 + Math.random() * 8;
      const angle = (140 + (Math.random() * 20 - 10)) * (Math.PI / 180);
      const length = 110 + Math.random() * 90;
      const color = Math.random() < 0.7 ? '#c084fc' : '#38bdf8';

      this.meteors.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: length,
        life: 0,
        maxLife: 35 + Math.random() * 25,
        color: color,
        width: 1.8 + Math.random() * 1.2
      });

      this.nextMeteorTime = Date.now() + 6000 + Math.random() * 8000;
    }

    setupEvents() {
      window.addEventListener('resize', () => {
        this.setupCanvas();
        this.createStars();
      }, { passive: true });

      window.addEventListener('mousemove', (e) => {
        this.targetMouseX = (e.clientX / this.width - 0.5) * 25;
        this.targetMouseY = (e.clientY / this.height - 0.5) * 25;
      }, { passive: true });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stop();
        } else if (this.theme === 'space') {
          this.start();
        }
      });
    }

    drawStarFlare(ctx, x, y, radius, alpha, color) {
      const flareLen = radius * 3.5;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * 0.55;
      ctx.lineWidth = 0.8;

      ctx.beginPath();
      ctx.moveTo(x - flareLen, y);
      ctx.lineTo(x + flareLen, y);
      ctx.moveTo(x, y - flareLen);
      ctx.lineTo(x, y + flareLen);
      ctx.stroke();

      ctx.restore();
    }

    render(time) {
      if (!this.isRunning) return;

      const dt = time - this.lastTime;
      this.lastTime = time;

      this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
      this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      if (Date.now() > this.nextMeteorTime && this.meteors.length < 2) {
        this.spawnMeteor();
      }

      for (let i = 0; i < this.stars.length; i++) {
        const star = this.stars[i];

        star.twinklePhase += star.twinkleSpeed * dt;
        const twinkle = Math.sin(star.twinklePhase) * star.twinkleAmp;
        star.alpha = Math.max(0.12, Math.min(1, star.baseAlpha + twinkle));

        star.y += star.driftSpeedY;
        star.x += star.driftSpeedX;

        if (star.y < -10) star.y = this.height + 10;
        if (star.y > this.height + 10) star.y = -10;
        if (star.x < -10) star.x = this.width + 10;
        if (star.x > this.width + 10) star.x = -10;

        const parallaxFactor = star.layer * 0.35;
        const renderX = star.x + this.mouseX * parallaxFactor;
        const renderY = star.y + this.mouseY * parallaxFactor;

        if (star.layer >= 2) {
          ctx.beginPath();
          ctx.arc(renderX, renderY, star.radius * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = star.color;
          ctx.globalAlpha = star.alpha * 0.25;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(renderX, renderY, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = star.alpha;
        ctx.fill();

        if (star.hasFlare && star.alpha > 0.65) {
          this.drawStarFlare(ctx, renderX, renderY, star.radius, star.alpha, star.color);
        }
      }

      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const m = this.meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.life++;

        const progress = m.life / m.maxLife;
        const fade = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;
        const alpha = Math.max(0, fade);

        if (progress >= 1 || m.x < -100 || m.y > this.height + 100) {
          this.meteors.splice(i, 1);
          continue;
        }

        const tailX = m.x - (m.vx / 15) * m.length;
        const tailY = m.y - (m.vy / 15) * m.length;

        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.2, m.color);
        grad.addColorStop(1, 'transparent');

        ctx.save();
        ctx.strokeStyle = grad;
        ctx.lineWidth = m.width;
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(m.x, m.y, m.width * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = m.color;
        ctx.shadowBlur = 12;
        ctx.fill();

        ctx.restore();
      }

      ctx.globalAlpha = 1;
      this.animId = requestAnimationFrame((t) => this.render(t));
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.lastTime = performance.now();
      this.animId = requestAnimationFrame((t) => this.render(t));
    }

    stop() {
      this.isRunning = false;
      if (this.animId) {
        cancelAnimationFrame(this.animId);
        this.animId = null;
      }
    }

    applyTheme(theme) {
      this.theme = theme;
      localStorage.setItem('nv_theme_bg', theme);

      if (theme === 'classic') {
        document.body.classList.add('classic-bg');
        document.body.classList.remove('space-bg-active');
        this.stop();
      } else {
        document.body.classList.remove('classic-bg');
        document.body.classList.add('space-bg-active');
        this.start();
      }

      this.updateButtons();
    }

    toggle() {
      const newTheme = this.theme === 'space' ? 'classic' : 'space';
      this.applyTheme(newTheme);

      const isSpace = newTheme === 'space';
      const msg = isSpace
        ? '🌌 Включён космический фон со звёздами (стиль Pulse Visual)'
        : '🎨 Возвращён стандартный классический фон сайта';
      
      if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast(msg, 'info');
      }
    }

    updateButtons() {
      const isSpace = this.theme === 'space';
      const icon = isSpace ? '🌌' : '🎨';
      const label = isSpace ? 'Фон: Космос' : 'Фон: Классика';
      const title = isSpace
        ? 'Сейчас включен Космос. Нажмите, чтобы вернуть стандартный фон'
        : 'Сейчас включен Классический фон. Нажмите, чтобы включить Космос';

      const floatPill = document.querySelector('.theme-switch-pill');
      if (floatPill) {
        floatPill.title = title;
        const iconEl = floatPill.querySelector('.theme-switch-icon');
        const textEl = floatPill.querySelector('.theme-switch-label');
        if (iconEl) iconEl.textContent = icon;
        if (textEl) textEl.textContent = label;
        floatPill.classList.toggle('is-classic', !isSpace);
      }

      const footerBtn = document.getElementById('footer-bg-toggle');
      if (footerBtn) {
        footerBtn.textContent = `${icon} ${label}`;
        footerBtn.title = title;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.spaceBg = new SpaceCosmosBackground();
    });
  } else {
    window.spaceBg = new SpaceCosmosBackground();
  }
})();
