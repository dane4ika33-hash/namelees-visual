// Daily Cyber Wheel of Fortune (Кибер-Рулетка Наград) for Nameless Visual
class LootboxSystem {
  constructor() {
    this.COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
    this.isSpinning = false;
    this.audioCtx = null;
    this.currentRotation = 0;

    // Default 8 sectors (synchronized with SQLite database)
    this.sectors = [
      { id: "rub_50", type: "rubles", amount: 50, title: "50 ₽", fullTitle: "50 ₽ на баланс", rarity: "common", icon: "🪙", color: "#172554", textColor: "#60a5fa", desc: "Деньги зачислены на баланс профиля!", weight: 35 },
      { id: "promo_nameless", type: "promo", code: "NAMELESS", discount: 20, title: "-20%", fullTitle: "Купон на скидку -20%", rarity: "uncommon", icon: "🎟️", color: "#1e1b4b", textColor: "#93c5fd", desc: "Промокод NAMELESS активирован в корзине!", weight: 15 },
      { id: "rub_150", type: "rubles", amount: 150, title: "150 ₽", fullTitle: "150 ₽ на баланс", rarity: "uncommon", icon: "💵", color: "#4c1d95", textColor: "#e9d5ff", desc: "Отличный приз на баланс кошелька!", weight: 20 },
      { id: "item_godcfg", type: "item", title: "Конфиг", fullTitle: "Приватный конфиг: Nameless Legit PvP", rarity: "legendary", icon: "📦", color: "#78350f", textColor: "#fef08a", desc: "Легендарный конфиг добавлен в ваш профиль!", weight: 5 },
      { id: "rub_50_2", type: "rubles", amount: 50, title: "50 ₽", fullTitle: "50 ₽ на баланс", rarity: "common", icon: "🪙", color: "#2e1065", textColor: "#c084fc", desc: "Деньги зачислены на баланс профиля!", weight: 15 },
      { id: "promo_50", type: "promo", code: "SUPER50", discount: 50, title: "СУПЕР -50%", fullTitle: "СУПЕР КУПОН -50%", rarity: "epic", icon: "🔥", color: "#701a75", textColor: "#f472b6", desc: "Огромная скидка 50% на любой пак!", weight: 8 },
      { id: "rub_300", type: "rubles", amount: 300, title: "300 ₽", fullTitle: "300 ₽ на баланс", rarity: "rare", icon: "💰", color: "#064e3b", textColor: "#6ee7b7", desc: "Крупный выигрыш на баланс кошелька!", weight: 12 },
      { id: "jackpot_500", type: "rubles", amount: 500, title: "ДЖЕКПОТ", fullTitle: "ДЖЕКПОТ 500 ₽ НА БАЛАНС!", rarity: "legendary", icon: "💎", color: "#713f12", textColor: "#fde047", desc: "СУПЕР ДЖЕКПОТ! 500 ₽ на ваш счет!", weight: 4 }
    ];

    this.init();
  }

  async init() {
    this.updateCooldownDisplay();
    setInterval(() => this.updateCooldownDisplay(), 1000);
    await this.loadSectors();
    setTimeout(() => this.drawWheels(), 150);
  }

  async loadSectors() {
    try {
      const res = await fetch('/api/roulette-items');
      const data = await res.json();
      if (data && data.success && Array.isArray(data.items) && data.items.length >= 2) {
        this.sectors = data.items.map(item => ({
          id: item.item_key || `item_${item.id}`,
          type: item.type || 'rubles',
          amount: parseFloat(item.amount) || 0,
          code: item.code || '',
          discount: parseInt(item.discount) || 0,
          title: item.title,
          fullTitle: item.full_title || item.title,
          rarity: item.rarity || 'common',
          icon: item.icon || '🎁',
          color: item.color || '#1e1b4b',
          textColor: item.text_color || '#c084fc',
          desc: item.description || (item.type === 'rubles' ? 'Деньги зачислены на баланс!' : 'Приз зачислен!'),
          weight: parseInt(item.weight) || 10
        }));
        this.drawWheels();
      }
    } catch (e) {
      console.warn('Using local fallback roulette sectors:', e);
    }
  }

  drawWheels() {
    document.querySelectorAll('.roulette-canvas').forEach(canvas => {
      this.drawWheel(canvas);
    });
  }

  drawWheel(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // High-DPI Retina Support: Render at 2x or devicePixelRatio for razor-sharp text and icons
    const dpr = Math.max(2, window.devicePixelRatio || 2);
    const logicalSize = 320;
    const targetPx = logicalSize * dpr;
    
    if (canvas.width !== targetPx || canvas.height !== targetPx) {
      canvas.width = targetPx;
      canvas.height = targetPx;
    }
    
    ctx.save();
    ctx.scale(dpr, dpr);

    const width = logicalSize;
    const height = logicalSize;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width / 2 - 12;
    const numSectors = this.sectors.length;
    if (numSectors === 0) {
      ctx.restore();
      return;
    }
    const arc = (2 * Math.PI) / numSectors;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw sectors with cyber obsidian-to-rarity gradient
    this.sectors.forEach((sector, i) => {
      const angle = i * arc - Math.PI / 2 - arc / 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angle, angle + arc);
      ctx.closePath();

      // Deep cyber gradient fill
      const grad = ctx.createRadialGradient(centerX, centerY, 20, centerX, centerY, radius);
      grad.addColorStop(0, '#060811');
      grad.addColorStop(0.35, sector.color || '#1e1b4b');
      grad.addColorStop(1, '#030408');
      ctx.fillStyle = grad;
      ctx.fill();

      // Glowing laser divider line
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
      ctx.shadowBlur = 4;
      ctx.stroke();

      // --- Thick, Vibrant & Glowing Reward Typography (No boxes/rectangles) ---
      ctx.translate(centerX, centerY);
      ctx.rotate(angle + arc / 2);

      const title = String(sector.title || '');
      const icon = sector.icon || '🎁';
      const label = `${icon} ${title}`;

      // Thick, ultra-bold font with dynamic auto-sizing for longer names
      let fontSize = 14;
      ctx.font = `900 ${fontSize}px "Inter", "Segoe UI", -apple-system, sans-serif`;
      const maxTextWidth = radius - 45;
      while (ctx.measureText(label).width > maxTextWidth && fontSize > 10) {
        fontSize--;
        ctx.font = `900 ${fontSize}px "Inter", "Segoe UI", -apple-system, sans-serif`;
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const posX = radius - 16;
      const posY = 0;

      // 1. Deep solid dark outline around text for razor-sharp separation and high contrast
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#02040a';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.strokeText(label, posX, posY);

      // 2. Radiant, bright glowing text fill in vibrant neon
      const brightColor = sector.textColor || '#ffffff';
      ctx.fillStyle = brightColor;
      ctx.shadowColor = brightColor;
      ctx.shadowBlur = 10;
      ctx.fillText(label, posX, posY);

      // 3. Second pass for extra intensity and brightness
      ctx.shadowBlur = 4;
      ctx.fillText(label, posX, posY);

      // Rarity crystal dot at sector outer edge
      ctx.beginPath();
      ctx.arc(radius - 5, 0, 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = brightColor;
      ctx.shadowColor = brightColor;
      ctx.shadowBlur = 8;
      ctx.fill();

      ctx.restore();
    });

    // 2. High-Tech Cyber HUD Outer Bezel
    ctx.save();
    
    // Outer cyber track
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 7, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.stroke();

    // Inner secondary tech ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 3, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Futuristic HUD Tick Marks
    const numTicks = 36;
    for (let i = 0; i < numTicks; i++) {
      const tickAngle = (i * (2 * Math.PI) / numTicks);
      const isMajor = (i % 6 === 0);
      const innerR = radius + (isMajor ? 3 : 5);
      const outerR = radius + (isMajor ? 10 : 8);
      const x1 = centerX + innerR * Math.cos(tickAngle);
      const y1 = centerY + innerR * Math.sin(tickAngle);
      const x2 = centerX + outerR * Math.cos(tickAngle);
      const y2 = centerY + outerR * Math.sin(tickAngle);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isMajor ? '#38bdf8' : 'rgba(192, 132, 252, 0.6)';
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.shadowColor = isMajor ? '#38bdf8' : 'transparent';
      ctx.shadowBlur = isMajor ? 6 : 0;
      ctx.stroke();
    }

    // 3. Inner Tech Ring (surrounding the central reactor core)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 39, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.stroke();

    ctx.restore(); // restore HUD styling
    ctx.restore(); // restore DPR scaling
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  playSound(type) {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'tick') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(480, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.045);
      } else if (type === 'win') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, now + idx * 0.1);
          g.gain.setValueAtTime(0.2, now + idx * 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.4);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(now + idx * 0.1);
          o.stop(now + idx * 0.1 + 0.45);
        });
      } else if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch (e) {
      console.warn('Audio playback error', e);
    }
  }

  getLastOpenTime() {
    if (window.app?.currentUser && window.app.currentUser.last_roulette_spin) {
      return window.app.currentUser.last_roulette_spin * 1000;
    }
    return parseInt(localStorage.getItem('nv_last_lootbox_time') || '0', 10);
  }

  getStreak() {
    return parseInt(localStorage.getItem('nv_streak_days') || '1', 10);
  }

  canOpen() {
    if (!window.app?.currentUser) return false;
    const lastTime = this.getLastOpenTime();
    if (!lastTime) return true;
    const now = Date.now();
    return (now - lastTime) >= this.COOLDOWN_MS;
  }

  getTimeRemaining() {
    const lastTime = this.getLastOpenTime();
    if (!lastTime) return 0;
    const now = Date.now();
    const diff = this.COOLDOWN_MS - (now - lastTime);
    return Math.max(0, diff);
  }

  updateCooldownDisplay() {
    const btns = document.querySelectorAll('.open-roulette-trigger-btn');
    const timerTexts = document.querySelectorAll('.roulette-timer-display');
    const badge = document.getElementById('header-bonus-badge');

    if (!window.app?.currentUser) {
      btns.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('disabled');
        btn.innerHTML = '<span>⚡ ВОЙТИ ДЛЯ ВРАЩЕНИЯ</span>';
      });
      timerTexts.forEach(t => {
        t.innerHTML = '<span class="status-ready" style="color: #cbd5e1;">Войдите в аккаунт, чтобы вращать рулетку!</span>';
      });
      if (badge) {
        badge.textContent = 'ВХОД';
        badge.classList.remove('badge-pulse');
      }
      return;
    }

    const remainingMs = this.getTimeRemaining();

    if (remainingMs <= 0) {
      btns.forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('disabled');
        btn.innerHTML = '<span>⚡ ВРАЩАТЬ РУЛЕТКУ</span>';
      });
      timerTexts.forEach(t => {
        t.innerHTML = '<span class="status-ready">Рулетка готова к вращению! Испытай удачу</span>';
      });
      if (badge) {
        badge.textContent = 'ГОТОВ';
        badge.classList.add('badge-pulse');
      }
    } else {
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
      const timeFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      btns.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('disabled');
        btn.innerHTML = `<span>⏳ Ожидание: ${timeFormatted}</span>`;
      });
      timerTexts.forEach(t => {
        t.innerHTML = `Следующее вращение через: <strong class="timer-digits">${timeFormatted}</strong>`;
      });
      if (badge) {
        badge.textContent = timeFormatted;
        badge.classList.remove('badge-pulse');
      }
    }

    document.querySelectorAll('.roulette-streak-display').forEach(el => {
      el.textContent = `${this.getStreak()} дн.`;
    });
  }

  rollWinningIndex() {
    if (!this.sectors || this.sectors.length === 0) return 0;
    const streak = this.getStreak();
    
    // Dynamic weights from DB configuration with streak multiplier
    const weights = this.sectors.map((s, idx) => {
      let w = Number(s.weight) || 10;
      if (s.rarity === 'legendary') {
        w += Math.min(streak, 3);
      } else if (s.rarity === 'epic') {
        w += Math.min(streak, 2);
      }
      return { index: idx, weight: Math.max(1, w) };
    });

    const total = weights.reduce((acc, w) => acc + w.weight, 0);
    let rand = Math.random() * total;

    for (let w of weights) {
      if (rand < w.weight) return w.index;
      rand -= w.weight;
    }
    return 0;
  }

  // Alias for backward compatibility
  openLootbox() {
    this.spinWheel();
  }

  spinWheel() {
    if (this.isSpinning) return;
    if (!window.app?.currentUser) {
      window.app?.showToast('⚠️ Войдите в аккаунт, чтобы вращать рулетку!', 'warning');
      window.app?.openAuthModal('login');
      return;
    }
    if (!this.canOpen()) {
      window.app?.showToast('⚠️ Рулетка перезаряжается! Дождитесь таймера.', 'warning');
      return;
    }

    this.isSpinning = true;
    const winningIdx = this.rollWinningIndex();
    const winningSector = this.sectors[winningIdx];

    const btns = document.querySelectorAll('.open-roulette-trigger-btn');
    btns.forEach(b => b.disabled = true);

    const resultCards = document.querySelectorAll('.roulette-result-card');
    resultCards.forEach(c => c.classList.remove('show'));

    // Wheel rotation calculation
    // Sector size is 45 degrees
    const sectorAngle = 360 / this.sectors.length;
    // To align sector center with top pointer (0 deg):
    const targetSectorOffset = 360 - (winningIdx * sectorAngle);
    // Add 6 to 9 full spins
    const extraSpins = 360 * 7;
    const spinDurationSec = 6;

    // Slight random deviation inside the slice (-12 deg to +12 deg)
    const randomJitter = (Math.random() - 0.5) * (sectorAngle * 0.5);
    const finalAngle = this.currentRotation + extraSpins + targetSectorOffset + randomJitter;
    this.currentRotation = finalAngle;

    // Apply rotation to all wheel elements on page
    const wheelWraps = document.querySelectorAll('.roulette-wheel-rotator');
    wheelWraps.forEach(wrap => {
      wrap.style.transition = `transform ${spinDurationSec}s cubic-bezier(0.12, 0.85, 0.15, 1)`;
      wrap.style.transform = `rotate(${finalAngle}deg)`;
    });

    // Pointer rattle animation
    const needles = document.querySelectorAll('.roulette-pointer-needle');
    needles.forEach(n => n.classList.add('vibrating'));

    // Ticking sound simulation while spinning
    let tickDelay = 60;
    const startTick = Date.now();
    const tickInterval = () => {
      const elapsed = (Date.now() - startTick) / 1000;
      if (elapsed >= spinDurationSec - 0.2) {
        needles.forEach(n => n.classList.remove('vibrating'));
        return;
      }
      this.playSound('tick');
      // Gradually slow down ticks
      tickDelay = 60 + Math.pow(elapsed / spinDurationSec, 3) * 350;
      setTimeout(tickInterval, tickDelay);
    };
    setTimeout(tickInterval, 50);

    // Finish spinning
    setTimeout(() => {
      this.finishSpin(winningSector);
    }, spinDurationSec * 1000 + 300);
  }

  async finishSpin(reward) {
    this.playSound('win');
    this.createConfetti();

    // Update cooldown & streak
    const now = Date.now();
    const last = this.getLastOpenTime();
    let streak = this.getStreak();

    if (last && (now - last) < (48 * 60 * 60 * 1000)) {
      streak = Math.min(streak + 1, 7);
    } else {
      streak = 1;
    }

    localStorage.setItem('nv_last_lootbox_time', now.toString());
    localStorage.setItem('nv_streak_days', streak.toString());

    // Claim reward via backend server API to sync balance & strictly enforce cooldown in SQLite DB
    if (window.app && window.app.claimRouletteReward) {
      await window.app.claimRouletteReward(reward);
    }

    // Handle local side-effects for promos / items
    if (reward.type === 'promo') {
      window.app?.savePromoCode(reward.code, reward.discount);
      window.app?.showToast(`🎉 Получен промокод ${reward.code} на скидку ${reward.discount}%!`, 'success');
    } else if (reward.type === 'item') {
      window.app?.addFreeUnlockedItem({
        id: 'won-godcfg',
        title: reward.fullTitle,
        downloadUrl: 'https://example.com/download/nameless-legit-pvp.zip'
      });
      window.app?.showToast(`🔥 Легендарный конфиг добавлен в ваш профиль!`, 'success');
    } else if (reward.type === 'rubles') {
      window.app?.showToast(`💵 +${reward.amount} ₽ начислено на ваш баланс!`, 'success');
    }

    window.app?.addLootboxHistoryEntry({
      title: reward.fullTitle,
      icon: reward.icon,
      rarity: reward.rarity
    });

    // Display result card
    const resultCards = document.querySelectorAll('.roulette-result-card');
    resultCards.forEach(c => {
      c.innerHTML = `
        <div class="reward-glow-ring ${reward.rarity}"></div>
        <div class="reward-icon">${reward.icon}</div>
        <div class="reward-rarity-badge ${reward.rarity}">${reward.rarity.toUpperCase()} НАГРАДА</div>
        <h3 class="reward-title">${reward.fullTitle}</h3>
        <p class="reward-desc">${reward.desc}</p>
        ${reward.code ? `<div class="reward-promo-code">Промокод: <code>${reward.code}</code></div>` : ''}
        <button class="action-btn primary-btn mt-3" onclick="window.lootbox.closeModal()">ОТЛИЧНО, ЗАБРАТЬ</button>
      `;
      c.classList.add('show');
    });

    this.isSpinning = false;
    this.updateCooldownDisplay();
  }

  createConfetti() {
    const container = document.querySelector('.lootbox-profile-card') || document.body;
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-particle';
      p.style.left = `${Math.random() * 80 + 10}%`;
      p.style.backgroundColor = ['#a855f7', '#8b5cf6', '#fbbf24', '#ec4899', '#38bdf8', '#34d399'][Math.floor(Math.random() * 6)];
      p.style.animationDuration = `${Math.random() * 1.5 + 1}s`;
      p.style.width = `${Math.random() * 8 + 6}px`;
      p.style.height = `${Math.random() * 14 + 8}px`;
      container.appendChild(p);

      setTimeout(() => p.remove(), 2500);
    }
  }

  openModal() {
    this.playSound('click');
    const modal = document.getElementById('lootbox-modal-backdrop');
    if (modal) {
      modal.classList.add('active');
      this.drawWheels();
      this.updateCooldownDisplay();
    }
  }

  closeModal() {
    this.playSound('click');
    const modal = document.getElementById('lootbox-modal-backdrop');
    if (modal) modal.classList.remove('active');
  }

  resetCooldown() {
    localStorage.removeItem('nv_last_lootbox_time');
    this.updateCooldownDisplay();
    window.app?.showToast('⏱️ Кулдаун рулетки сброшен! Можно крутить снова.', 'info');
  }
}

window.lootbox = new LootboxSystem();
