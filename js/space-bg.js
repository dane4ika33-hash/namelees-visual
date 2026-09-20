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
      this.isMobile = (window.innerWidth < 768) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      this.dpr = this.isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      this.animId = null;
      this.lastTime = 0;
      this.isRunning = false;
      this.isScrolling = false;
      this.scrollTimer = null;
      this.mouseX = 0;
      this.mouseY = 0;
      this.targetMouseX = 0;
      this.targetMouseY = 0;
      this.nextMeteorTime = Date.now() + (this.isMobile ? 10000 : 3000);
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
      this.ctx = this.canvas.getContext('2d', { alpha: true });

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
      this.isMobile = (this.width < 768) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      this.dpr = this.isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);

      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';

      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(this.dpr, this.dpr);
    }

    createStars() {
      this.stars = [];
      const isMobile = this.isMobile;
      const count = isMobile ? 36 : Math.floor(Math.min(120, Math.max(50, (this.width * this.height) / 11000)));

      for (let i = 0; i < count; i++) {
        const layer = isMobile ? (Math.random() < 0.7 ? 1 : 2) : (Math.random() < 0.65 ? 1 : Math.random() < 0.88 ? 2 : 3);
        let radius, baseAlpha, speed, hasFlare;

        if (layer === 1) {
          radius = 0.6 + Math.random() * 0.6;
          baseAlpha = 0.3 + Math.random() * 0.45;
          speed = 0.02 + Math.random() * 0.04;
          hasFlare = false;
        } else if (layer === 2) {
          radius = 1.0 + Math.random() * 0.8;
          baseAlpha = 0.5 + Math.random() * 0.4;
          speed = 0.04 + Math.random() * 0.06;
          hasFlare = !isMobile && Math.random() < 0.15;
        } else {
          radius = 1.6 + Math.random() * 0.9;
          baseAlpha = 0.75 + Math.random() * 0.25;
          speed = 0.06 + Math.random() * 0.07;
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
          twinkleSpeed: 0.0015 + Math.random() * 0.003,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleAmp: 0.2 + Math.random() * 0.3,
          driftSpeedY: -speed,
          driftSpeedX: (Math.random() - 0.5) * speed * 0.3,
          hasFlare: hasFlare
        });
      }
    }

    spawnMeteor() {
      const startX = Math.random() * (this.width * 1.2);
      const startY = -40 + Math.random() * (this.height * 0.3);
      const speed = this.isMobile ? 10 : (12 + Math.random() * 8);
      const angle = (140 + (Math.random() * 20 - 10)) * (Math.PI / 180);
      const length = this.isMobile ? 80 : (110 + Math.random() * 90);
      const color = Math.random() < 0.7 ? '#c084fc' : '#38bdf8';

      this.meteors.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: length,
        life: 0,
        maxLife: this.isMobile ? 30 : (35 + Math.random() * 25),
        color: color,
        width: this.isMobile ? 1.4 : (1.8 + Math.random() * 1.2)
      });

      this.nextMeteorTime = Date.now() + (this.isMobile ? 14000 : 7000) + Math.random() * 8000;
    }

    setupEvents() {
      window.addEventListener('resize', () => {
        this.setupCanvas();
        this.createStars();
      }, { passive: true });

      window.addEventListener('mousemove', (e) => {
        if (this.isMobile) return;
        this.targetMouseX = (e.clientX / this.width - 0.5) * 20;
        this.targetMouseY = (e.clientY / this.height - 0.5) * 20;
      }, { passive: true });

      window.addEventListener('scroll', () => {
        if (!this.isMobile) return;
        this.isScrolling = true;
        clearTimeout(this.scrollTimer);
        this.scrollTimer = setTimeout(() => {
          this.isScrolling = false;
        }, 120);
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

      // When actively scrolling on mobile, skip rendering so CPU/GPU focuses 100% on silky smooth touch scrolling
      if (this.isMobile && this.isScrolling) {
        this.animId = requestAnimationFrame((t) => this.render(t));
        return;
      }

      const dt = Math.min(time - this.lastTime, 64);
      this.lastTime = time;

      if (!this.isMobile) {
        this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
        this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;
      }

      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      if (Date.now() > this.nextMeteorTime && this.meteors.length < (this.isMobile ? 1 : 2)) {
        this.spawnMeteor();
      }

      const isMobile = this.isMobile;
      for (let i = 0; i < this.stars.length; i++) {
        const star = this.stars[i];

        star.twinklePhase += star.twinkleSpeed * dt;
        const twinkle = Math.sin(star.twinklePhase) * star.twinkleAmp;
        star.alpha = Math.max(0.15, Math.min(1, star.baseAlpha + twinkle));

        star.y += star.driftSpeedY;
        star.x += star.driftSpeedX;

        if (star.y < -10) star.y = this.height + 10;
        if (star.y > this.height + 10) star.y = -10;
        if (star.x < -10) star.x = this.width + 10;
        if (star.x > this.width + 10) star.x = -10;

        const parallaxFactor = star.layer * 0.35;
        const renderX = star.x + (isMobile ? 0 : this.mouseX * parallaxFactor);
        const renderY = star.y + (isMobile ? 0 : this.mouseY * parallaxFactor);

        if (!isMobile && star.layer >= 2) {
          ctx.beginPath();
          ctx.arc(renderX, renderY, star.radius * 2, 0, Math.PI * 2);
          ctx.fillStyle = star.color;
          ctx.globalAlpha = star.alpha * 0.22;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(renderX, renderY, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = star.alpha;
        ctx.fill();

        if (!isMobile && star.hasFlare && star.alpha > 0.68) {
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
        if (!isMobile) {
          ctx.shadowColor = m.color;
          ctx.shadowBlur = 8;
        }
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
