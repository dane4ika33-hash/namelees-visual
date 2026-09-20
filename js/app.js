// Error logging
window.onerror = function(msg, url, line, col, error) {
  console.error('[CLIENT ERROR]', msg, url, line, col, error);
  fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg, url, line, col, stack: error ? error.stack : '' })
  }).catch(() => {});
};

// Namelees Visual - Main Application Logic (Auth, Profile, Rubles Balance, Shop, Admin)
class App {
  constructor() {
    this.products = [];
    this.cart = [];
    this.currentUser = null;
    this.users = {};
    this.promoCodes = {};
    this.activeDiscount = 0;
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.selectedProduct = null;
    this.adminCurrentEditingId = null;
    this.adminAttachedImages = [];
    this.adminPassword = localStorage.getItem('nv_admin_pass') || 'admin123';
    this.appliedTopupPromo = null;
    this.cachedAdminPromos = [];

    this.init();
  }

  async init() {
    this.loadProducts();
    this.loadCart();
    this.renderProducts();
    this.updateCartBadge();
    this.setupEventListeners();

    // Immediately load cached user from localStorage so the site NEVER flickers to guest
    this.loadCachedUser();
    this.updateUserUI();

    // Synchronize current user with SQLite Database
    await this.syncCurrentUser();
    this.initProfilePage();
    this.initSettingsPage();

    // Check if returning from EasyDonate successful payment
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      setTimeout(async () => {
        await this.syncCurrentUser();
        this.showToast('🎉 Оплата успешно завершена! Баланс пополнен.', 'success');
        try {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (e) {}
      }, 300);
    }

    // Secret URL hash trigger
    if (window.location.hash === '#admin') {
      setTimeout(() => {
        this.openAdminModal();
        try { history.replaceState(null, null, window.location.pathname); } catch (e) {}
      }, 300);
    }

    // Daily Bonus hash trigger: #bonus or #roulette
    const handleBonusHash = () => {
      const hash = (window.location.hash || '').toLowerCase();
      if (hash === '#bonus' || hash === '#roulette' || hash === '#lootbox' || hash === '#daily-bonus-section') {
        setTimeout(() => {
          const section = document.getElementById('daily-bonus-section');
          if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            section.style.transition = 'box-shadow 0.6s ease';
            section.style.boxShadow = '0 0 45px rgba(236, 72, 153, 0.7), 0 0 25px rgba(168, 85, 247, 0.5)';
            setTimeout(() => {
              section.style.boxShadow = '';
            }, 2000);
          }
        }, 350);
      }
    };
    handleBonusHash();
    window.addEventListener('hashchange', handleBonusHash);

    this.updateUserUI();
    this.initMobileBottomNav();
    window.addEventListener('hashchange', () => this.initMobileBottomNav());

    // Auto-open Welcome / Registration modal only for truly brand-new visitors who have no token or cached account
    const hasExistingAuth = !!(this.currentUser || localStorage.getItem('nv_auth_token') || localStorage.getItem('nv_cached_user'));
    if (!hasExistingAuth && !window.location.pathname.includes('profile.html') && !window.location.pathname.includes('settings.html') && window.location.hash !== '#admin') {
      setTimeout(() => {
        const stillNoAuth = !(this.currentUser || localStorage.getItem('nv_auth_token') || localStorage.getItem('nv_cached_user'));
        if (stillNoAuth) {
          this.openAuthModal('register');
        }
      }, 1000);
    }
  }

  // --- API Client Helper ---
  async apiRequest(endpoint, method = 'GET', data = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('nv_auth_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const options = { method, headers };
      if (data && method !== 'GET') options.body = JSON.stringify(data);
      const res = await fetch(endpoint, options);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return json || { success: false, status: res.status, message: `HTTP ${res.status}` };
      }
      return json;
    } catch (e) {
      console.warn('API error, using local fallback:', e);
      return null;
    }
  }

  async syncCurrentUser(retryCount = 0) {
    const token = localStorage.getItem('nv_auth_token');
    if (token) {
      try {
        const res = await this.apiRequest('/api/me');
        if (res && res.success && res.user) {
          this.currentUser = {
            ...res.user,
            balanceRub: res.user.balance,
            unlockedItems: res.purchases || []
          };
          this.saveCurrentUserCache();

          if (res.user.last_roulette_spin && res.user.last_roulette_spin > 0) {
            localStorage.setItem('nv_last_lootbox_time', (res.user.last_roulette_spin * 1000).toString());
          } else {
            localStorage.removeItem('nv_last_lootbox_time');
          }
          if (window.lootbox) {
            window.lootbox.updateCooldownDisplay();
          }
          this.updateUserUI();
          if (document.getElementById('page-prof-nickname')) {
            this.initProfilePage();
          }
          if (document.getElementById('settings-email')) {
            this.initSettingsPage();
          }
          return;
        } else if (res && (res.status === 401 || (res.message && res.message.includes('Не авторизован')))) {
          // Token is explicitly invalidated or deleted on server
          console.warn('Session expired or token invalid');
          this.currentUser = null;
          this.saveCurrentUserCache();
          localStorage.removeItem('nv_auth_token');
          this.updateUserUI();
          return;
        }
      } catch (err) {
        console.warn('Network error during /api/me:', err);
      }

      // If server is spinning up (Render free tier sleeps after 15 min) or temporary network glitch:
      // DO NOT wipe user session! Keep cached profile and retry in background.
      if (this.currentUser) {
        this.updateUserUI();
        if (retryCount < 3) {
          setTimeout(() => this.syncCurrentUser(retryCount + 1), 3500 * (retryCount + 1));
        }
        return;
      }
    }

    // Fallback to local storage if server is not responding or no token
    this.loadUsersAndAuth();
    this.updateUserUI();
    if (document.getElementById('page-prof-nickname')) {
      this.initProfilePage();
    }
    if (document.getElementById('settings-email')) {
      this.initSettingsPage();
    }
  }

  // Helper: Format balance with thousands separators or readable compact units for huge numbers
  formatBalance(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return '0 ₽';
    const num = Math.round(Number(amount));
    if (num >= 1e15) {
      return (num / 1e15).toFixed(1).replace('.0', '') + ' квдрлн ₽';
    }
    if (num >= 1e12) {
      return (num / 1e12).toFixed(1).replace('.0', '') + ' трлн ₽';
    }
    if (num >= 1e9) {
      return (num / 1e9).toFixed(1).replace('.0', '') + ' млрд ₽';
    }
    if (num >= 1e6) {
      return (num / 1e6).toFixed(1).replace('.0', '') + ' млн ₽';
    }
    return num.toLocaleString('ru-RU') + ' ₽';
  }

  // --- Users & Authentication ---
  loadCachedUser() {
    try {
      const cached = localStorage.getItem('nv_cached_user');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (parsed.email || parsed.nickname)) {
          this.currentUser = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('Error parsing nv_cached_user:', e);
    }
    this.loadUsersAndAuth();
  }

  saveCurrentUserCache() {
    if (this.currentUser) {
      try {
        localStorage.setItem('nv_cached_user', JSON.stringify(this.currentUser));
        localStorage.setItem('nv_current_user_email', this.currentUser.email);
      } catch (e) {}
    } else {
      localStorage.removeItem('nv_cached_user');
      localStorage.removeItem('nv_current_user_email');
    }
  }

  loadUsersAndAuth() {
    const savedUsers = localStorage.getItem('nv_registered_users');
    if (savedUsers) {
      try { this.users = JSON.parse(savedUsers); } catch (e) { this.users = {}; }
    } else {
      this.users = {};
    }

    const currentEmail = localStorage.getItem('nv_current_user_email');
    if (currentEmail && this.users[currentEmail]) {
      this.currentUser = this.users[currentEmail];
    } else if (!this.currentUser) {
      this.currentUser = null;
    }
  }

  saveUsers() {
    if (this.currentUser) {
      this.users[this.currentUser.email] = this.currentUser;
      localStorage.setItem('nv_current_user_email', this.currentUser.email);
    } else {
      localStorage.removeItem('nv_current_user_email');
    }
    localStorage.setItem('nv_registered_users', JSON.stringify(this.users));
  }

  openAuthModal(tab = 'register') {
    this.switchAuthTab(tab);
    if (typeof window.switchAuthTab === 'function') {
      window.switchAuthTab(tab);
    }
    const modal = document.getElementById('auth-modal-backdrop');
    if (modal) modal.classList.add('active');
  }

  closeAuthModal() {
    const modal = document.getElementById('auth-modal-backdrop');
    if (modal) modal.classList.remove('active');
  }

  switchAuthTab(tab) {
    const regTabBtn = document.getElementById('auth-tab-btn-register');
    const loginTabBtn = document.getElementById('auth-tab-btn-login');
    const regForm = document.getElementById('auth-form-register');
    const loginForm = document.getElementById('auth-form-login');

    if (tab === 'register') {
      if (regTabBtn) regTabBtn.classList.add('active');
      if (loginTabBtn) loginTabBtn.classList.remove('active');
      if (regForm) regForm.style.display = 'block';
      if (loginForm) loginForm.style.display = 'none';
    } else {
      if (loginTabBtn) loginTabBtn.classList.add('active');
      if (regTabBtn) regTabBtn.classList.remove('active');
      if (loginForm) loginForm.style.display = 'block';
      if (regForm) regForm.style.display = 'none';
    }
  }

  async registerUser(email, password, nickname) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    const cleanNick = (nickname || cleanEmail.split('@')[0] || 'Player').trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      this.showToast('❌ Введите корректный адрес электронной почты!', 'error');
      return;
    }
    if (!cleanPass || cleanPass.length < 3) {
      this.showToast('❌ Пароль должен быть не короче 3 символов!', 'error');
      return;
    }

    // Call SQLite Database API
    const res = await this.apiRequest('/api/register', 'POST', {
      email: cleanEmail,
      password: cleanPass,
      nickname: cleanNick
    });

    if (res && res.success) {
      localStorage.setItem('nv_auth_token', res.token);
      localStorage.setItem('nv_current_user_email', cleanEmail);
      this.currentUser = {
        ...res.user,
        balanceRub: res.user.balance,
        unlockedItems: []
      };
      this.saveCurrentUserCache();
      if (res.user.last_roulette_spin && res.user.last_roulette_spin > 0) {
        localStorage.setItem('nv_last_lootbox_time', (res.user.last_roulette_spin * 1000).toString());
      } else {
        localStorage.removeItem('nv_last_lootbox_time');
      }
      if (window.lootbox) {
        window.lootbox.updateCooldownDisplay();
      }
      this.updateUserUI();
      const authModal = document.getElementById('auth-modal-backdrop');
      if (authModal) authModal.classList.remove('active');
      this.showToast(res.message || `🎉 Добро пожаловать, ${cleanNick}! На ваш баланс начислено 50 ₽!`, 'success');
      if (document.getElementById('page-prof-nickname')) {
        this.initProfilePage();
      }
      return;
    }

    if (res && !res.success) {
      this.showToast(res.message, 'warning');
      if (res.message.includes('уже существует') || res.message.includes('войдите')) {
        this.switchAuthTab('login');
      }
      return;
    }

    // Fallback if server is not reachable
    const newUser = {
      email: cleanEmail,
      nickname: cleanNick,
      password: cleanPass,
      balanceRub: 50,
      unlockedItems: [],
      lootboxHistory: [],
      registeredAt: new Date().toLocaleDateString('ru-RU')
    };
    this.users[cleanEmail] = newUser;
    this.currentUser = newUser;
    this.saveUsers();
    this.saveCurrentUserCache();
    this.updateUserUI();
    const authModal = document.getElementById('auth-modal-backdrop');
    if (authModal) authModal.classList.remove('active');
    this.showToast(`🎉 Добро пожаловать, ${cleanNick}! На ваш баланс начислено 50 ₽!`, 'success');
  }

  async loginUser(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      this.showToast('❌ Введите почту и пароль!', 'error');
      return;
    }

    // Call SQLite Database API
    const res = await this.apiRequest('/api/login', 'POST', {
      email: cleanEmail,
      password: cleanPass
    });

    if (res && res.success) {
      localStorage.setItem('nv_auth_token', res.token);
      localStorage.setItem('nv_current_user_email', cleanEmail);
      this.currentUser = {
        ...res.user,
        balanceRub: res.user.balance,
        unlockedItems: res.purchases || []
      };
      this.saveCurrentUserCache();
      if (res.user.last_roulette_spin && res.user.last_roulette_spin > 0) {
        localStorage.setItem('nv_last_lootbox_time', (res.user.last_roulette_spin * 1000).toString());
      } else {
        localStorage.removeItem('nv_last_lootbox_time');
      }
      if (window.lootbox) {
        window.lootbox.updateCooldownDisplay();
      }
      this.updateUserUI();
      const authModal = document.getElementById('auth-modal-backdrop');
      if (authModal) authModal.classList.remove('active');
      this.showToast(`✅ С возвращением, ${res.user.nickname}! Данные и баланс загружены.`, 'success');
      if (document.getElementById('page-prof-nickname')) {
        this.initProfilePage();
      }
      return;
    }

    if (res && !res.success) {
      // 1. Check if user had a local account in browser storage before SQLite migration
      if (this.users && this.users[cleanEmail] && this.users[cleanEmail].password === cleanPass) {
        const localUser = this.users[cleanEmail];
        const regRes = await this.apiRequest('/api/register', 'POST', {
          email: cleanEmail,
          password: cleanPass,
          nickname: localUser.nickname || cleanEmail.split('@')[0]
        });
        if (regRes && regRes.success) {
          localStorage.setItem('nv_auth_token', regRes.token);
          localStorage.setItem('nv_current_user_email', cleanEmail);
          this.currentUser = {
            ...regRes.user,
            balanceRub: regRes.user.balance,
            unlockedItems: []
          };
          this.saveCurrentUserCache();
          this.updateUserUI();
          const authModal = document.getElementById('auth-modal-backdrop');
          if (authModal) authModal.classList.remove('active');
          this.showToast(`✅ Аккаунт ${cleanEmail} успешно перенесён в базу данных!`, 'success');
          if (document.getElementById('page-prof-nickname')) {
            this.initProfilePage();
          }
          return;
        }
      }

      this.showToast(`❌ ${res.message}`, 'error');

      // Auto-switch to registration tab if email is not yet in the database
      if (res.message && res.message.includes('не зарегистрирован')) {
        this.switchAuthTab('register');
        const regEmailInput = document.getElementById('reg-email');
        if (regEmailInput) {
          regEmailInput.value = cleanEmail;
          const regPassInput = document.getElementById('reg-password');
          if (regPassInput) regPassInput.focus();
        }
      }
      return;
    }

    // Local fallback
    if (this.users[cleanEmail] && this.users[cleanEmail].password === cleanPass) {
      this.currentUser = this.users[cleanEmail];
      this.saveUsers();
      this.saveCurrentUserCache();
      this.updateUserUI();
      const authModal = document.getElementById('auth-modal-backdrop');
      if (authModal) authModal.classList.remove('active');
      this.showToast(`✅ Вы успешно вошли как ${this.currentUser.nickname}!`, 'success');
    } else {
      this.showToast('❌ Неверная почта или пароль!', 'error');
    }
  }

  logoutUser() {
    this.currentUser = null;
    this.saveCurrentUserCache();
    localStorage.removeItem('nv_auth_token');
    localStorage.removeItem('nv_current_user_email');
    localStorage.removeItem('nv_last_lootbox_time');
    if (window.lootbox) {
      window.lootbox.updateCooldownDisplay();
    }
    this.updateUserUI();
    this.closeAllModals();
    this.showToast('🚪 Вы вышли из своего профиля', 'info');
    if (window.location.pathname.includes('profile.html') || window.location.pathname.includes('settings.html')) {
      window.location.href = 'index.html';
    } else {
      this.openAuthModal('login');
    }
  }

  updateUserUI() {
    const userBtn = document.getElementById('header-user-profile-btn');
    const balanceEl = document.getElementById('header-balance-amount');
    const headerAvatarChar = document.getElementById('header-user-avatar-char');
    const headerAvatarImg = document.getElementById('header-user-avatar-img');

    if (this.currentUser) {
      if (userBtn) {
        userBtn.style.display = 'inline-flex';
        userBtn.title = 'Открыть мой профиль';
        const nickEl = document.getElementById('header-user-nickname');
        if (nickEl) nickEl.textContent = this.currentUser.nickname || 'Профиль';
        
        if (this.currentUser.avatar) {
          if (headerAvatarImg) {
            headerAvatarImg.src = this.currentUser.avatar;
            headerAvatarImg.style.display = 'block';
          }
          if (headerAvatarChar) headerAvatarChar.style.display = 'none';
        } else {
          if (headerAvatarImg) headerAvatarImg.style.display = 'none';
          if (headerAvatarChar) {
            headerAvatarChar.style.display = 'flex';
            headerAvatarChar.textContent = (this.currentUser.nickname || 'U')[0].toUpperCase();
          }
        }
      }
      if (balanceEl) {
        balanceEl.textContent = this.formatBalance(this.currentUser.balanceRub);
      }
    } else {
      if (userBtn) {
        userBtn.style.display = 'inline-flex';
        userBtn.title = 'Войти в аккаунт';
        if (headerAvatarImg) headerAvatarImg.style.display = 'none';
        if (headerAvatarChar) {
          headerAvatarChar.style.display = 'flex';
          headerAvatarChar.textContent = '👤';
        }
        const nickEl = document.getElementById('header-user-nickname');
        if (nickEl) nickEl.textContent = 'Войти';
      }
      if (balanceEl) {
        balanceEl.textContent = `0\u00A0₽`;
      }
    }

    // On profile.html, toggle the Logout and Login buttons based on auth state
    const profLogoutBtn = document.getElementById('prof-header-logout-btn');
    if (profLogoutBtn) {
      profLogoutBtn.style.display = this.currentUser ? 'inline-flex' : 'none';
    }
    if (userBtn && window.location.pathname.includes('profile.html')) {
      userBtn.style.display = this.currentUser ? 'none' : 'inline-flex';
    }
  }

  handleHeaderUserClick() {
    if (this.currentUser) {
      window.location.href = 'profile.html';
    } else {
      this.openAuthModal('login');
    }
  }

  // --- Profile Modal ---
  openProfileModal(activeTab = 'items') {
    if (!this.currentUser) {
      this.openAuthModal('login');
      return;
    }

    // Populate profile fields
    document.getElementById('prof-avatar-char').textContent = (this.currentUser.nickname || 'U')[0].toUpperCase();
    document.getElementById('prof-nickname').textContent = this.currentUser.nickname;
    document.getElementById('prof-email').textContent = this.currentUser.email;
    document.getElementById('prof-balance').textContent = this.formatBalance(this.currentUser.balanceRub);
    document.getElementById('prof-reg-date').textContent = this.currentUser.registeredAt || 'Недавно';

    const profStatus = document.getElementById('prof-status');
    if (profStatus) {
      const role = this.currentUser.vip_status || 'Игрок';
      profStatus.textContent = role.toUpperCase();
      if (role === 'СОЗДАТЕЛЬ') {
        profStatus.className = 'product-badge';
        profStatus.style.cssText = 'position:static; margin-left: 6px; background: linear-gradient(135deg, #f43f5e, #e11d48); color: #fff; box-shadow: 0 0 12px rgba(244,63,94,0.7); font-weight: 800;';
      } else if (role === 'VIP Игрок' || role === 'VIP') {
        profStatus.className = 'product-badge badge-pro';
        profStatus.style.cssText = 'position:static; margin-left: 6px; background: #fbbf24; color: #000; font-weight: 800;';
      } else {
        profStatus.className = 'product-badge';
        profStatus.style.cssText = 'position:static; margin-left: 6px; background: rgba(56,189,248,0.2); color: #38bdf8; border: 1px solid #38bdf8;';
      }
    }

    this.renderProfilePurchases();
    this.renderProfileDrops();
    this.switchProfileTab(activeTab);

    document.getElementById('profile-modal-backdrop').classList.add('active');
  }

  switchProfileTab(tab) {
    document.querySelectorAll('.profile-nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.profile-tab-content').forEach(c => c.style.display = 'none');

    const tabBtn = document.getElementById(`prof-tab-btn-${tab}`);
    const tabContent = document.getElementById(`prof-tab-content-${tab}`);

    if (tabBtn) tabBtn.classList.add('active');
    if (tabContent) tabContent.style.display = 'block';
  }

  renderProfilePurchases() {
    const container = document.getElementById('prof-purchases-container');
    if (!container) return;

    const items = (this.currentUser && this.currentUser.unlockedItems) || [];
    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 32px; margin-bottom: 8px;">📦</div>
          <p>У вас пока нет купленных ресурспаков или конфигов.</p>
          <button class="action-btn primary-btn btn-sm mt-3" onclick="window.app.closeAllModals()">Перейти в магазин</button>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="unlocked-item-box mb-3">
        <div>
          <strong>${item.title || item.product_title || 'Товар'}</strong>
          <div class="text-muted text-xs">${item.category === 'config' ? '⚙️ Конфиг' : '📦 Ресурспак'} • Активировано • ${item.purchased_at || ''}</div>
        </div>
        <button class="action-btn primary-btn btn-sm" onclick="window.open('${item.download_url || item.downloadUrl || 'https://t.me/NameleesVisual'}', '_blank')">
          ⬇️ Скачать архив
        </button>
      </div>
    `).join('');
  }

  renderProfileDrops() {
    const container = document.getElementById('prof-drops-container');
    if (!container) return;

    const drops = (this.currentUser && this.currentUser.lootboxHistory) || [];
    if (drops.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 32px; margin-bottom: 8px;">🎡</div>
          <p>Вы еще не вращали рулетку сегодня.</p>
          <button class="action-btn gold-btn btn-sm mt-3" onclick="window.app.closeAllModals(); window.lootbox.openModal();">Вращать рулетку</button>
        </div>
      `;
      return;
    }

    container.innerHTML = drops.slice(-8).reverse().map(d => `
      <div class="profile-drop-row">
        <span class="drop-icon">${d.icon || '🎁'}</span>
        <div class="flex-grow">
          <div class="font-bold text-sm">${d.title}</div>
          <div class="text-xs text-muted">${d.date}</div>
        </div>
        <span class="reward-rarity-badge ${d.rarity || 'common'}">${(d.rarity || 'common').toUpperCase()}</span>
      </div>
    `).join('');
  }

  addLootboxHistoryEntry(reward) {
    if (!this.currentUser) return;
    if (!this.currentUser.lootboxHistory) this.currentUser.lootboxHistory = [];

    this.currentUser.lootboxHistory.push({
      title: reward.title,
      icon: reward.icon,
      rarity: reward.rarity,
      date: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    });
    this.saveUsers();
    if (document.getElementById('page-prof-drops')) {
      this.renderProfilePageDrops();
    }
  }

  // --- Dedicated profile.html page logic ---
  initProfilePage() {
    const isProfilePage = document.getElementById('page-prof-nickname');
    if (!isProfilePage) return;

    const nickEl = document.getElementById('page-prof-nickname');
    const emailEl = document.getElementById('page-prof-email');
    const balEl = document.getElementById('page-prof-balance');
    const avEl = document.getElementById('page-prof-avatar-char');
    const avImg = document.getElementById('page-prof-avatar-img');
    const dateEl = document.getElementById('page-prof-reg-date');
    const statusEl = document.getElementById('page-prof-status');
    const statusIconEl = document.getElementById('page-prof-status-icon');
    const changePhotoBtn = document.getElementById('page-prof-change-photo-btn');
    const loginPromptBtn = document.getElementById('page-prof-login-prompt-btn');

    if (!this.currentUser) {
      if (nickEl) nickEl.textContent = 'Гость';
      if (emailEl) emailEl.textContent = 'Не авторизован';
      if (balEl) balEl.textContent = '0 ₽';
      if (dateEl) dateEl.textContent = '—';
      if (statusEl) {
        statusEl.textContent = 'ИГРОК';
        statusEl.style.color = '#38bdf8';
        statusEl.style.fontWeight = '700';
        statusEl.style.textShadow = 'none';
      }
      if (statusIconEl) statusIconEl.textContent = '🎮';
      if (avImg) avImg.style.display = 'none';
      if (avEl) {
        avEl.style.display = 'flex';
        avEl.textContent = '👤';
      }
      if (changePhotoBtn) changePhotoBtn.style.display = 'none';
      if (loginPromptBtn) loginPromptBtn.style.display = 'inline-flex';

      this.renderProfilePagePurchases();
      this.renderProfilePageDrops();

      setTimeout(() => {
        if (!this.currentUser) {
          this.openAuthModal('login');
        }
      }, 300);
      return;
    }

    if (changePhotoBtn) changePhotoBtn.style.display = 'inline-flex';
    if (loginPromptBtn) loginPromptBtn.style.display = 'none';

    if (nickEl) nickEl.textContent = this.currentUser.nickname;
    if (emailEl) emailEl.textContent = this.currentUser.email;
    if (balEl) balEl.textContent = this.formatBalance(this.currentUser.balanceRub);
    if (dateEl) dateEl.textContent = this.currentUser.registeredAt || '18.09.2026';

    const role = this.currentUser.vip_status || 'Игрок';
    const adminBtn = document.getElementById('page-prof-admin-btn');
    if (adminBtn) adminBtn.style.display = (role === 'СОЗДАТЕЛЬ') ? 'flex' : 'none';

    if (statusEl) {
      statusEl.textContent = role.toUpperCase();
      if (role === 'СОЗДАТЕЛЬ') {
        statusEl.style.color = '#f43f5e';
        statusEl.style.fontWeight = '900';
        statusEl.style.textShadow = '0 0 16px rgba(244, 63, 94, 0.8)';
        if (statusIconEl) statusIconEl.textContent = '👑';
      } else if (role === 'VIP Игрок' || role === 'VIP') {
        statusEl.style.color = '#fbbf24';
        statusEl.style.fontWeight = '800';
        statusEl.style.textShadow = '0 0 14px rgba(251, 191, 36, 0.6)';
        if (statusIconEl) statusIconEl.textContent = '⭐';
      } else {
        statusEl.style.color = '#38bdf8';
        statusEl.style.fontWeight = '700';
        statusEl.style.textShadow = 'none';
        if (statusIconEl) statusIconEl.textContent = '🎮';
      }
    }

    if (this.currentUser.avatar) {
      if (avImg) {
        avImg.src = this.currentUser.avatar;
        avImg.style.display = 'block';
      }
      if (avEl) avEl.style.display = 'none';
    } else {
      if (avImg) avImg.style.display = 'none';
      if (avEl) {
        avEl.style.display = 'flex';
        avEl.textContent = (this.currentUser.nickname || 'U')[0].toUpperCase();
      }
    }

    this.renderProfilePagePurchases();
    this.renderProfilePageDrops();
  }

  async handleAvatarUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('❌ Пожалуйста, выберите файл изображения (PNG, JPG, WEBP)!', 'error');
      return;
    }

    if (!this.currentUser) {
      this.showToast('⚠️ Войдите в свой аккаунт, чтобы сменить аватарку!', 'warning');
      return;
    }

    this.showToast('⏳ Загрузка и сохранение аватарки...', 'info');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        // Optimize avatar image to 256x256 max using in-memory canvas
        const canvas = document.createElement('canvas');
        const maxDim = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        // Send to SQLite backend
        const res = await this.apiRequest('/api/user/avatar', 'POST', {
          avatar: optimizedDataUrl
        });

        if (res && res.success) {
          this.currentUser.avatar = optimizedDataUrl;
          this.updateUserUI();
          this.initProfilePage();
          this.showToast('🎉 Новая аватарка успешно сохранена в базе данных!', 'success');
        } else {
          // Local fallback
          this.currentUser.avatar = optimizedDataUrl;
          this.saveUsers();
          this.updateUserUI();
          this.initProfilePage();
          this.showToast('✅ Аватарка обновлена локально!', 'success');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  renderProfilePagePurchases() {
    const container = document.getElementById('page-prof-purchases');
    if (!container) return;

    const items = (this.currentUser && this.currentUser.unlockedItems) || [];
    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 36px; margin-bottom: 8px;">📦</div>
          <p>У вас пока нет купленных ресурспаков или конфигов.</p>
          <a href="index.html#shop" class="action-btn primary-btn btn-sm mt-3">Перейти в магазин товаров</a>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="unlocked-item-box mb-3">
        <div>
          <strong>${item.title || item.product_title || 'Товар'}</strong>
          <div class="text-muted text-xs">${item.category === 'config' ? '⚙️ Конфиг' : '📦 Ресурспак'} • Доступ навсегда • ${item.purchased_at || ''}</div>
        </div>
        <button class="action-btn primary-btn btn-sm" onclick="window.open('${item.download_url || item.downloadUrl || 'https://t.me/NameleesVisual'}', '_blank')">
          ⬇️ Скачать архив
        </button>
      </div>
    `).join('');
  }

  renderProfilePageDrops() {
    const container = document.getElementById('page-prof-drops');
    if (!container) return;

    const drops = (this.currentUser && this.currentUser.lootboxHistory) || [];
    if (drops.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size: 32px; margin-bottom: 8px;">🎡</div>
          <p>Вы пока не вращали рулетку. Испытайте удачу выше!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = drops.slice(-10).reverse().map(d => `
      <div class="profile-drop-row">
        <span class="drop-icon">${d.icon || '🎁'}</span>
        <div style="flex-grow: 1;">
          <div style="font-weight: 700; font-size: 0.9rem;">${d.title}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${d.date}</div>
        </div>
        <span class="reward-rarity-badge ${d.rarity || 'common'}">${(d.rarity || 'common').toUpperCase()}</span>
      </div>
    `).join('');
  }

  togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (btn) btn.textContent = '👁️‍🗨️';
      if (btn) btn.title = 'Скрыть пароль';
    } else {
      input.type = 'password';
      if (btn) btn.textContent = '👁️';
      if (btn) btn.title = 'Показать пароль';
    }
  }

  // --- Balance Top-up Simulation & Promo Codes ---
  openTopupModal() {
    this.appliedTopupPromo = null;
    const promoInput = document.getElementById('topup-promo-input');
    if (promoInput) promoInput.value = '';
    const promoMsg = document.getElementById('topup-promo-msg');
    if (promoMsg) {
      promoMsg.style.display = 'none';
      promoMsg.textContent = '';
      promoMsg.className = 'topup-promo-msg';
    }
    const promoBadge = document.getElementById('topup-promo-badge');
    if (promoBadge) promoBadge.style.display = 'none';

    this.updateTopupCalculation();
    const modal = document.getElementById('topup-modal-backdrop');
    if (modal) modal.classList.add('active');
  }

  selectTopupAmount(amount) {
    const input = document.getElementById('topup-amount-input');
    if (input) input.value = amount;
    document.querySelectorAll('.topup-amount-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.textContent, 10) === amount);
    });
    this.updateTopupCalculation();
  }

  handleTopupAmountChange() {
    const input = document.getElementById('topup-amount-input');
    const val = parseInt(input ? input.value : 0, 10);
    document.querySelectorAll('.topup-amount-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.textContent, 10) === val);
    });
    this.updateTopupCalculation();
  }

  updateTopupCalculation() {
    const input = document.getElementById('topup-amount-input');
    const depositAmount = parseInt(input ? input.value : 0, 10) || 0;

    const creditEl = document.getElementById('topup-calc-credit');
    const discountRow = document.getElementById('topup-calc-discount-row');
    const discountLabel = document.getElementById('topup-calc-discount-label');
    const discountValEl = document.getElementById('topup-calc-discount-val');
    const payEl = document.getElementById('topup-calc-pay');
    const submitBtn = document.getElementById('topup-submit-btn');

    if (creditEl) creditEl.textContent = `${depositAmount} ₽`;

    let payAmount = depositAmount;
    if (this.appliedTopupPromo && this.appliedTopupPromo.discount_percent > 0) {
      const pct = this.appliedTopupPromo.discount_percent;
      const discountRub = Math.round(depositAmount * (pct / 100));
      payAmount = Math.max(0, depositAmount - discountRub);

      if (discountRow) discountRow.style.display = 'flex';
      if (discountLabel) discountLabel.textContent = `Скидка по промокоду (-${pct}%):`;
      if (discountValEl) discountValEl.textContent = `-${discountRub} ₽`;
      if (payEl) payEl.textContent = `${payAmount} ₽`;
      if (submitBtn) {
        submitBtn.innerHTML = `⚡ ОПЛАТИТЬ ${payAmount} ₽ <span style="font-size: 0.8em; opacity: 0.9;">(Зачислить ${depositAmount} ₽)</span>`;
      }
    } else {
      if (discountRow) discountRow.style.display = 'none';
      if (payEl) payEl.textContent = `${depositAmount} ₽`;
      if (submitBtn) {
        submitBtn.textContent = `⚡ ПОПОЛНИТЬ ${depositAmount} ₽`;
      }
    }
  }

  async applyTopupPromo() {
    const promoInput = document.getElementById('topup-promo-input');
    const code = promoInput ? promoInput.value.trim().toUpperCase() : '';
    const msgEl = document.getElementById('topup-promo-msg');
    const badgeEl = document.getElementById('topup-promo-badge');

    if (!code) {
      if (msgEl) {
        msgEl.style.display = 'flex';
        msgEl.className = 'topup-promo-msg error';
        msgEl.textContent = '⚠️ Введите промокод!';
      }
      return;
    }

    try {
      const res = await this.apiRequest('/api/promocode/check', 'POST', { code });
      if (res && res.success) {
        this.appliedTopupPromo = {
          code: res.code,
          discount_percent: res.discount_percent,
          description: res.description
        };
        if (badgeEl) {
          badgeEl.textContent = `-${res.discount_percent}% СКИДКА`;
          badgeEl.style.display = 'inline-block';
        }
        if (msgEl) {
          msgEl.style.display = 'flex';
          msgEl.className = 'topup-promo-msg success';
          msgEl.innerHTML = `
            <span>✅ Промокод <strong>${res.code}</strong> применен (-${res.discount_percent}%)</span>
            <button type="button" onclick="window.app.removeTopupPromo()" style="background:none; border:none; color:#f87171; text-decoration:underline; cursor:pointer; font-size:0.75rem; font-weight:700;">Отменить</button>
          `;
        }
        this.updateTopupCalculation();
        this.showToast(`🎉 Промокод ${res.code} на скидку ${res.discount_percent}% активирован!`, 'success');
        return;
      }

      // Local fallback check
      const fallbackPromos = {
        'NAMELEES': 20,
        'BONUS10': 10,
        'BONUS20': 20,
        'SUPER30': 30,
        'START': 15
      };
      if (fallbackPromos[code]) {
        const discount = fallbackPromos[code];
        this.appliedTopupPromo = { code, discount_percent: discount, description: `Скидка ${discount}%` };
        if (badgeEl) {
          badgeEl.textContent = `-${discount}% СКИДКА`;
          badgeEl.style.display = 'inline-block';
        }
        if (msgEl) {
          msgEl.style.display = 'flex';
          msgEl.className = 'topup-promo-msg success';
          msgEl.innerHTML = `
            <span>✅ Промокод <strong>${code}</strong> применен (-${discount}%)</span>
            <button type="button" onclick="window.app.removeTopupPromo()" style="background:none; border:none; color:#f87171; text-decoration:underline; cursor:pointer; font-size:0.75rem; font-weight:700;">Отменить</button>
          `;
        }
        this.updateTopupCalculation();
        this.showToast(`🎉 Промокод ${code} активирован!`, 'success');
        return;
      }

      if (msgEl) {
        msgEl.style.display = 'flex';
        msgEl.className = 'topup-promo-msg error';
        msgEl.textContent = res?.message || `❌ Промокод «${code}» не найден или неактивен`;
      }
    } catch (e) {
      if (msgEl) {
        msgEl.style.display = 'flex';
        msgEl.className = 'topup-promo-msg error';
        msgEl.textContent = '❌ Ошибка проверки промокода';
      }
    }
  }

  removeTopupPromo() {
    this.appliedTopupPromo = null;
    const promoInput = document.getElementById('topup-promo-input');
    if (promoInput) promoInput.value = '';
    const msgEl = document.getElementById('topup-promo-msg');
    if (msgEl) {
      msgEl.style.display = 'none';
      msgEl.textContent = '';
      msgEl.className = 'topup-promo-msg';
    }
    const badgeEl = document.getElementById('topup-promo-badge');
    if (badgeEl) badgeEl.style.display = 'none';
    this.updateTopupCalculation();
    this.showToast('Промокод отменен', 'info');
  }

  async confirmTopup() {
    const input = document.getElementById('topup-amount-input');
    const amount = parseInt(input ? input.value : 0, 10);
    if (!amount || amount <= 0) {
      this.showToast('⚠️ Введите сумму для пополнения!', 'warning');
      return;
    }

    const promoCode = this.appliedTopupPromo ? this.appliedTopupPromo.code : null;
    const res = await this.apiRequest('/api/topup', 'POST', { 
      amount, 
      code: promoCode 
    });

    if (res && res.success) {
      // 1. EasyDonate payment URL redirect
      if (res.pay_url) {
        this.showToast('💳 Перенаправление на безопасную оплату EasyDonate...', 'info');
        const modal = document.getElementById('topup-modal-backdrop');
        if (modal) modal.classList.remove('active');
        setTimeout(() => {
          window.location.href = res.pay_url;
        }, 600);
        return;
      }

      // 2. Direct balance credit (e.g. test mode)
      if (res.balance !== undefined) {
        this.currentUser.balanceRub = res.balance;
        this.currentUser.balance = res.balance;
        this.updateUserUI();
        const profBal = document.getElementById('page-prof-balance');
        if (profBal) profBal.textContent = this.formatBalance(res.balance);
        
        const modal = document.getElementById('topup-modal-backdrop');
        if (modal) modal.classList.remove('active');
        
        const discountText = (res.discount_percent > 0) ? ` (со скидкой ${res.discount_percent}%: ${res.paid} ₽)` : '';
        this.showToast(`💳 Баланс пополнен на +${amount} ₽${discountText}!`, 'success');
        return;
      }
    }

    if (res && !res.success) {
      if (res.requires_anketa) {
        if (res.is_creator) {
          const doTest = confirm(`${res.message}\n\n${res.hint}\n\nВы вошли как Создатель. Зачислить +${amount} ₽ в тестовом режиме без кассы?`);
          if (doTest) {
            const testRes = await this.apiRequest('/api/topup', 'POST', {
              amount,
              code: promoCode,
              test_mode: true
            });
            if (testRes && testRes.success) {
              this.currentUser.balanceRub = testRes.balance;
              this.currentUser.balance = testRes.balance;
              this.updateUserUI();
              const profBal = document.getElementById('page-prof-balance');
              if (profBal) profBal.textContent = this.formatBalance(testRes.balance);
              const modal = document.getElementById('topup-modal-backdrop');
              if (modal) modal.classList.remove('active');
              this.showToast(`⚡ Тестовый баланс +${amount} ₽ успешно зачислен!`, 'success');
            }
            return;
          }
        }
        this.showToast(`⚠️ ${res.message}. ${res.hint}`, 'warning');
        return;
      }
      this.showToast(`⚠️ ${res.message || 'Ошибка создания платежа'}`, 'danger');
      return;
    }

    // Local fallback
    this.addBalanceRub(amount, 'Пополнение баланса');
    const modal = document.getElementById('topup-modal-backdrop');
    if (modal) modal.classList.remove('active');
    this.showToast(`💳 Баланс успешно пополнен на +${amount} ₽!`, 'success');
  }

  async addBalanceRub(amount, reason = '') {
    if (!this.currentUser) return;
    const res = await this.apiRequest('/api/topup', 'POST', { amount });
    if (res && res.success) {
      this.currentUser.balanceRub = res.balance;
    } else {
      this.currentUser.balanceRub = (this.currentUser.balanceRub || 0) + amount;
      this.saveUsers();
    }
    this.updateUserUI();
    const profBal = document.getElementById('page-prof-balance');
    if (profBal) profBal.textContent = this.formatBalance(this.currentUser.balanceRub);
    this.showToast(`💵 +${amount} ₽ начислено на ваш баланс!`, 'success');
  }

  async claimRouletteReward(reward) {
    if (!this.currentUser) {
      this.showToast('⚠️ Войдите в аккаунт, чтобы крутить рулетку!', 'warning');
      return { success: false };
    }

    const payload = {
      type: reward.type,
      amount: reward.amount || 0,
      title: reward.fullTitle || reward.title || 'Приз из рулетки'
    };

    const res = await this.apiRequest('/api/roulette-reward', 'POST', payload);
    if (res && res.success) {
      if (res.balance !== undefined) {
        this.currentUser.balance = res.balance;
        this.currentUser.balanceRub = res.balance;
      }
      if (res.last_roulette_spin) {
        this.currentUser.last_roulette_spin = res.last_roulette_spin;
        localStorage.setItem('nv_last_lootbox_time', (res.last_roulette_spin * 1000).toString());
      }
      if (res.purchases) {
        this.currentUser.unlockedItems = res.purchases;
      }
      this.saveUsers();
      this.updateUserUI();
      const profBal = document.getElementById('page-prof-balance');
      if (profBal) profBal.textContent = `${this.currentUser.balanceRub} ₽`;
      if (window.lootbox) {
        window.lootbox.updateCooldownDisplay();
      }
      return res;
    } else {
      const errMsg = res?.message || 'Ошибка синхронизации рулетки';
      this.showToast(`⚠️ ${errMsg}`, 'error');
      if (res?.last_roulette_spin) {
        this.currentUser.last_roulette_spin = res.last_roulette_spin;
        localStorage.setItem('nv_last_lootbox_time', (res.last_roulette_spin * 1000).toString());
      }
      if (window.lootbox) {
        window.lootbox.updateCooldownDisplay();
      }
      return res || { success: false };
    }
  }

  // --- Products Management ---
  async loadProducts() {
    const saved = localStorage.getItem('nv_custom_products');
    let localProducts = null;
    if (saved) {
      try { localProducts = JSON.parse(saved); } catch (e) { localProducts = null; }
    }

    // Immediately display cached local/default products
    this.products = localProducts || [...DEFAULT_PRODUCTS];
    this.renderProducts();

    // Fetch synchronized catalog from server
    try {
      const res = await this.apiRequest('/api/products');
      if (res && res.success) {
        if (res.has_custom && Array.isArray(res.products)) {
          // Server has customized catalog -> always use server catalog across all devices!
          this.products = res.products;
          localStorage.setItem('nv_custom_products', JSON.stringify(this.products));
          this.renderProducts();
          if (document.getElementById('admin-products-list')) this.renderAdminProductsList();
        } else if (localProducts && localProducts.length > 0) {
          // Server is fresh, but this client (admin PC) has local customized products!
          // Auto-sync local list to server so phones immediately receive it!
          await this.saveProductsToServer();
        }
      }
    } catch (e) {
      console.warn('Could not sync products from server:', e);
    }
  }

  async saveProducts() {
    localStorage.setItem('nv_custom_products', JSON.stringify(this.products));
    await this.saveProductsToServer();
  }

  async saveProductsToServer() {
    try {
      const token = localStorage.getItem('nv_auth_token') || sessionStorage.getItem('nv_admin_token') || '';
      const adminPass = sessionStorage.getItem('nv_admin_pass') || localStorage.getItem('nv_admin_pass') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (adminPass) headers['X-Admin-Password'] = adminPass;

      const res = await fetch('/api/products', {
        method: 'POST',
        headers,
        body: JSON.stringify({ products: this.products })
      });
      const data = await res.json();
      if (data && data.success) {
        console.log('[CATALOG] Synced products to server:', data.message);
      }
    } catch (e) {
      console.warn('[CATALOG] Failed to sync products to server:', e);
    }
  }

  async forceSyncProductsToServer() {
    await this.saveProductsToServer();
    this.showToast('☁️ Каталог успешно синхронизирован с сервером для всех устройств!', 'success');
  }

  loadCart() {
    const saved = localStorage.getItem('nv_cart');
    if (saved) {
      try { this.cart = JSON.parse(saved); } catch (e) { this.cart = []; }
    } else {
      this.cart = [];
    }
  }

  saveCart() {
    localStorage.setItem('nv_cart', JSON.stringify(this.cart));
  }

  setupEventListeners() {
    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderProducts();
      });
    }

    // Filter pills
    const filterBtns = document.querySelectorAll('.filter-pill');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFilter = btn.getAttribute('data-filter') || 'all';
        this.renderProducts();
      });
    });

    // Secret 3-tap on logo to open admin (ideal for mobile where Alt+V isn't available)
    const logoLinks = document.querySelectorAll('.brand-logo-link, .brand-logo-wrap');
    let logoClicks = 0;
    let logoTimer = null;
    logoLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        logoClicks++;
        clearTimeout(logoTimer);
        if (logoClicks >= 3) {
          e.preventDefault();
          logoClicks = 0;
          this.openAdminModal();
        } else {
          logoTimer = setTimeout(() => { logoClicks = 0; }, 600);
        }
      });
    });

    // Modals escape key & Secret Alt+V shortcut for Admin / Product Editor
    window.addEventListener('keydown', (e) => {
      // Secret Alt + V shortcut (works on both English and Russian keyboard layouts)
      const isKeyV = e.code === 'KeyV' || (e.key && (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м'));
      if (e.altKey && isKeyV) {
        e.preventDefault();
        this.openAdminModal();
      }

      if (e.key === 'Escape') {
        if (this.currentUser) this.closeAllModals();
      }
    });

    // Backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          if (backdrop.id === 'auth-modal-backdrop' && !this.currentUser) return;
          this.closeAllModals();
        }
      });
    });
  }

  renderProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    let filtered = this.products.filter(item => {
      if (this.activeFilter === 'resourcepack' && item.category !== 'resourcepack') return false;
      if (this.activeFilter === 'config' && item.category !== 'config') return false;
      if (this.activeFilter === 'free' && item.price > 0) return false;

      if (this.searchQuery) {
        const inTitle = item.title.toLowerCase().includes(this.searchQuery);
        const inDesc = (item.shortDesc || '').toLowerCase().includes(this.searchQuery);
        const inTags = (item.tags || []).some(t => t.toLowerCase().includes(this.searchQuery));
        if (!inTitle && !inDesc && !inTags) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="no-products-state">
          <div class="no-products-icon">🔍</div>
          <h3>Товаров не найдено</h3>
          <p>Попробуйте изменить поисковый запрос или фильтр</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(product => {
      const mainImg = (product.images && product.images.length > 0) 
        ? product.images[0] 
        : 'assets/logo.jpg';
      
      const badgeHtml = product.badge ? `
        <span class="product-badge badge-${product.badgeType || 'hot'}">${product.badge}</span>
      ` : '';

      const tagsHtml = (product.tags || []).map(t => `<span class="product-tag">${t}</span>`).join('');

      const priceHtml = product.price === 0 
        ? '<span class="price-free">БЕСПЛАТНО</span>' 
        : `<span class="price-amount">${product.price} ₽</span>`;

      return `
        <div class="product-card" data-id="${product.id}">
          <div class="card-image-wrap" onclick="window.app.openProductModal('${product.id}')">
            <img src="${mainImg}" alt="${product.title}" loading="lazy" class="card-thumbnail" onerror="this.src='assets/logo.jpg'"/>
            <div class="image-overlay">
              <span class="preview-btn-label">👁️ Смотреть обзор (${product.images ? product.images.length : 1} фото)</span>
            </div>
            ${badgeHtml}
          </div>

          <div class="card-content">
            <div class="card-tags-row">${tagsHtml}</div>
            <h3 class="card-title" onclick="window.app.openProductModal('${product.id}')">${product.title}</h3>
            <p class="card-desc">${product.shortDesc || ''}</p>

            <div class="card-footer">
              <div class="card-price-block">
                ${priceHtml}
              </div>
              <div class="card-actions">
                <button class="action-btn outline-btn btn-sm" onclick="window.app.openProductModal('${product.id}')" title="Скриншоты и описание">
                  Инфо
                </button>
                <button class="action-btn primary-btn btn-sm" onclick="window.app.addToCart('${product.id}')">
                  ${product.price === 0 ? 'Скачать' : 'В корзину'}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Product Modal with Photo Gallery ---
  openProductModal(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;
    this.selectedProduct = product;

    const modal = document.getElementById('product-detail-modal');
    if (!modal) return;

    const images = (product.images && product.images.length > 0) ? product.images : ['assets/logo.jpg'];
    
    document.getElementById('modal-product-title').textContent = product.title;
    document.getElementById('modal-product-category').textContent = product.category === 'resourcepack' ? 'Ресурспак' : 'Конфиг';
    document.getElementById('modal-product-desc').textContent = product.fullDesc || product.shortDesc || '';
    
    const priceEl = document.getElementById('modal-product-price');
    if (priceEl) {
      priceEl.innerHTML = product.price === 0 
        ? '<strong class="text-emerald-400">БЕСПЛАТНО</strong>' 
        : `<strong>${product.price} ₽</strong>`;
    }

    const tagsContainer = document.getElementById('modal-product-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = (product.tags || []).map(t => `<span class="product-tag">${t}</span>`).join('');
    }

    const featContainer = document.getElementById('modal-product-features');
    if (featContainer) {
      if (product.features && product.features.length > 0) {
        featContainer.innerHTML = `
          <h4>Особенности и преимущества:</h4>
          <ul class="features-list">
            ${product.features.map(f => `<li><span class="check-icon">✓</span> ${f}</li>`).join('')}
          </ul>
        `;
      } else {
        featContainer.innerHTML = '';
      }
    }

    const mainImgEl = document.getElementById('modal-main-image');
    mainImgEl.src = images[0];
    mainImgEl.onerror = () => { mainImgEl.src = 'assets/logo.jpg'; };

    const thumbsContainer = document.getElementById('modal-thumbnails-strip');
    if (thumbsContainer) {
      if (images.length > 1) {
        thumbsContainer.innerHTML = images.map((img, idx) => `
          <div class="thumb-item ${idx === 0 ? 'active' : ''}" onclick="window.app.setModalImage('${img}', this)">
            <img src="${img}" alt="Preview ${idx + 1}" onerror="this.src='assets/logo.jpg'"/>
          </div>
        `).join('');
      } else {
        thumbsContainer.innerHTML = '';
      }
    }

    const buyBtn = document.getElementById('modal-buy-btn');
    if (buyBtn) {
      if (product.price === 0) {
        buyBtn.innerHTML = '⚡ СКАЧАТЬ БЕСПЛАТНО';
        buyBtn.onclick = () => {
          this.downloadDirect(product);
        };
      } else {
        buyBtn.innerHTML = '🛒 ДОБАВИТЬ В КОРЗИНУ';
        buyBtn.onclick = () => {
          this.addToCart(product.id);
          this.closeAllModals();
          this.openCart();
        };
      }
    }

    document.getElementById('product-modal-backdrop').classList.add('active');
  }

  setModalImage(src, el) {
    const mainImg = document.getElementById('modal-main-image');
    if (mainImg) mainImg.src = src;

    const allThumbs = document.querySelectorAll('.thumb-item');
    allThumbs.forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
  }

  downloadDirect(product) {
    this.showToast(`🚀 Загрузка ${product.title} началась!`, 'success');
    window.open(product.downloadUrl || 'https://example.com/download.zip', '_blank');
  }

  // --- Cart System & Checkout ---
  addToCart(productId) {
    if (!this.currentUser) {
      this.openAuthModal('register');
      return;
    }

    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    if (product.price === 0) {
      this.downloadDirect(product);
      return;
    }

    const existing = this.cart.find(c => c.id === productId);
    if (existing) {
      this.showToast(`Товар "${product.title}" уже в корзине!`, 'info');
    } else {
      this.cart.push({ ...product, count: 1 });
      this.saveCart();
      this.updateCartBadge();
      this.showToast(`✅ "${product.title}" добавлен в корзину!`, 'success');
    }
  }

  removeFromCart(productId) {
    this.cart = this.cart.filter(item => item.id !== productId);
    this.saveCart();
    this.updateCartBadge();
    this.renderCart();
    this.showToast('Товар удален из корзины', 'info');
  }

  updateCartBadge() {
    const badge = document.getElementById('header-cart-count');
    if (badge) {
      badge.textContent = this.cart.length.toString();
      badge.style.display = this.cart.length > 0 ? 'inline-flex' : 'none';
    }
    const mobileBadge = document.getElementById('mobile-cart-badge');
    if (mobileBadge) {
      mobileBadge.textContent = this.cart.length.toString();
      mobileBadge.style.display = this.cart.length > 0 ? 'inline-flex' : 'none';
    }
  }

  initMobileBottomNav() {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    
    document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));

    if (path.includes('settings.html')) {
      const s = document.getElementById('mnav-settings');
      if (s) s.classList.add('active');
    } else if (path.includes('profile.html')) {
      if (hash === '#bonus') {
        const b = document.getElementById('mnav-bonus');
        if (b) b.classList.add('active');
      } else {
        const p = document.getElementById('mnav-profile');
        if (p) p.classList.add('active');
      }
    } else {
      if (hash === '#bonus' || hash === '#roulette' || hash === '#lootbox') {
        const b = document.getElementById('mnav-bonus');
        if (b) b.classList.add('active');
      } else {
        const sh = document.getElementById('mnav-shop');
        if (sh) sh.classList.add('active');
      }
    }
  }

  openCart() {
    if (!this.currentUser) {
      this.openAuthModal('login');
      return;
    }
    this.renderCart();
    document.getElementById('cart-modal-backdrop').classList.add('active');
  }

  renderCart() {
    const container = document.getElementById('cart-items-container');
    const summaryContainer = document.getElementById('cart-summary-block');
    if (!container) return;

    if (this.cart.length === 0) {
      container.innerHTML = `
        <div class="empty-cart-state">
          <div class="empty-cart-icon">🛒</div>
          <p>Ваша корзина пуста</p>
          <button class="action-btn primary-btn btn-sm mt-2" onclick="window.app.closeAllModals()">В магазин</button>
        </div>
      `;
      if (summaryContainer) summaryContainer.style.display = 'none';
      return;
    }

    if (summaryContainer) summaryContainer.style.display = 'block';

    let subtotal = 0;
    container.innerHTML = this.cart.map(item => {
      subtotal += item.price;
      const img = (item.images && item.images.length > 0) ? item.images[0] : 'assets/logo.jpg';
      return `
        <div class="cart-item-row">
          <img src="${img}" alt="${item.title}" class="cart-item-img" onerror="this.src='assets/logo.jpg'"/>
          <div class="cart-item-info">
            <h4 class="cart-item-title">${item.title}</h4>
            <span class="cart-item-category">${item.category === 'resourcepack' ? 'Ресурспак' : 'Конфиг'}</span>
            <div class="cart-item-price">${item.price} ₽</div>
          </div>
          <button class="cart-remove-btn" onclick="window.app.removeFromCart('${item.id}')" title="Удалить">✕</button>
        </div>
      `;
    }).join('');

    let discountAmount = 0;
    if (this.activeDiscount > 0) {
      discountAmount = Math.round(subtotal * (this.activeDiscount / 100));
    }

    const finalTotal = Math.max(0, subtotal - discountAmount);
    const userBalance = (this.currentUser && this.currentUser.balanceRub) || 0;

    document.getElementById('cart-subtotal').textContent = `${subtotal} ₽`;
    
    const promoRow = document.getElementById('cart-discount-row');
    if (promoRow) {
      if (this.activeDiscount > 0) {
        promoRow.style.display = 'flex';
        document.getElementById('cart-discount-amount').textContent = `-${discountAmount} ₽ (${this.activeDiscount}%)`;
      } else {
        promoRow.style.display = 'none';
      }
    }

    document.getElementById('cart-final-total').textContent = `${finalTotal} ₽`;
    document.getElementById('cart-user-balance-text').textContent = `${userBalance} ₽`;

    // Checkout button state
    const checkoutBtn = document.getElementById('cart-checkout-btn');
    if (checkoutBtn) {
      if (userBalance >= finalTotal) {
        checkoutBtn.innerHTML = `⚡ Оплатить с баланса (${finalTotal} ₽)`;
        checkoutBtn.classList.remove('gold-btn');
        checkoutBtn.classList.add('primary-btn');
      } else {
        const diff = finalTotal - userBalance;
        checkoutBtn.innerHTML = `💳 Пополнить баланс на ${diff} ₽ и оплатить`;
        checkoutBtn.classList.remove('primary-btn');
        checkoutBtn.classList.add('gold-btn');
      }
    }
  }

  applyPromo(code) {
    if (!code) return;
    const cleanCode = code.toUpperCase().trim();
    
    const defaultCodes = {
      'NAMELEES': 20,
      'PULSE': 20,
      'BONUS20': 20,
      'SUPER50': 50
    };

    const discount = this.promoCodes[cleanCode] || defaultCodes[cleanCode];

    if (discount) {
      this.activeDiscount = discount;
      this.showToast(`🎉 Промокод ${cleanCode} применен: скидка -${discount}%!`, 'success');
      this.renderCart();
    } else {
      this.showToast(`❌ Неверный или истекший промокод: ${cleanCode}`, 'error');
    }
  }

  savePromoCode(code, discount) {
    this.promoCodes[code.toUpperCase()] = discount;
  }

  async checkout() {
    if (!this.currentUser) {
      this.openAuthModal('login');
      return;
    }
    if (this.cart.length === 0) return;

    let subtotal = this.cart.reduce((acc, c) => acc + c.price, 0);
    let discountAmount = Math.round(subtotal * (this.activeDiscount / 100));
    let finalTotal = Math.max(0, subtotal - discountAmount);
    let userBalance = this.currentUser.balanceRub || 0;

    if (userBalance < finalTotal) {
      // Prompt topup
      this.closeAllModals();
      document.getElementById('topup-amount-input').value = finalTotal - userBalance;
      this.openTopupModal();
      this.showToast(`💡 Для оплаты необходимо пополнить баланс на ${finalTotal - userBalance} ₽`, 'info');
      return;
    }

    // Call SQLite Database API to process purchase
    const res = await this.apiRequest('/api/purchase', 'POST', {
      items: this.cart
    });

    if (res && res.success) {
      this.currentUser.balanceRub = res.balance;
      this.currentUser.unlockedItems = res.purchases;
      const purchased = [...this.cart];

      this.cart = [];
      this.saveCart();
      this.updateCartBadge();
      this.updateUserUI();
      this.closeAllModals();

      this.showSuccessOrderModal(purchased);
      this.showToast(`🎉 Оплата прошла успешно! Товары сохранены в базе данных.`, 'success');
      return;
    }

    if (res && !res.success) {
      this.showToast(`❌ ${res.message}`, 'error');
      if (res.needTopup) {
        this.closeAllModals();
        this.openTopupModal();
      }
      return;
    }

    // Local fallback if server unreachable
    this.currentUser.balanceRub -= finalTotal;
    const purchased = [...this.cart];
    if (!this.currentUser.unlockedItems) this.currentUser.unlockedItems = [];
    purchased.forEach(p => {
      if (!this.currentUser.unlockedItems.some(u => u.id === p.id)) {
        this.currentUser.unlockedItems.push(p);
      }
    });

    this.cart = [];
    this.saveCart();
    this.saveUsers();
    this.updateCartBadge();
    this.updateUserUI();
    this.closeAllModals();
    this.showSuccessOrderModal(purchased);
  }

  showSuccessOrderModal(purchasedItems) {
    const modal = document.getElementById('order-success-modal');
    if (!modal) return;

    const itemsContainer = document.getElementById('order-downloads-list');
    if (itemsContainer) {
      itemsContainer.innerHTML = purchasedItems.map(item => `
        <div class="unlocked-item-box">
          <div class="unlocked-item-title">
            <span>📦 ${item.title}</span>
            <span class="badge-free">АКТИВИРОВАНО</span>
          </div>
          <button class="action-btn primary-btn btn-sm" onclick="window.open('${item.downloadUrl || 'https://example.com/download.zip'}', '_blank')">
            ⬇️ СКАЧАТЬ ФАЙЛЫ
          </button>
        </div>
      `).join('');
    }

    document.getElementById('order-success-backdrop').classList.add('active');
  }

  addFreeUnlockedItem(item) {
    if (!this.currentUser) return;
    if (!this.currentUser.unlockedItems) this.currentUser.unlockedItems = [];

    if (!this.currentUser.unlockedItems.some(u => u.id === item.id)) {
      this.currentUser.unlockedItems.push(item);
      this.saveUsers();
    }
  }

  // --- Admin Mode & Photo Manager ---
  openAdminModal() {
    // Close auth modal if open
    const authModal = document.getElementById('auth-modal-backdrop');
    if (authModal) authModal.classList.remove('active');

    const adminLoginBackdrop = document.getElementById('admin-login-modal-backdrop');
    if (!adminLoginBackdrop) {
      window.location.href = 'index.html#admin';
      return;
    }

    const adminToken = sessionStorage.getItem('nv_admin_token');
    const isCreator = this.currentUser && this.currentUser.vip_status === 'СОЗДАТЕЛЬ';

    // If Creator or already logged in as admin, open admin directly!
    if (adminToken || isCreator) {
      this.renderAdminProductsList();
      this.resetAdminForm();
      const adminBackdrop = document.getElementById('admin-modal-backdrop');
      if (adminBackdrop) adminBackdrop.classList.add('active');
      return;
    }

    const passInput = document.getElementById('admin-password-input');
    if (passInput) passInput.value = '';
    adminLoginBackdrop.classList.add('active');
    setTimeout(() => {
      if (passInput) passInput.focus();
    }, 150);
  }

  async submitAdminLogin() {
    const input = document.getElementById('admin-password-input');
    if (!input) return;
    const entered = input.value.trim();
    if (!entered) return;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: entered })
      });
      const data = await res.json();

      if (data && data.success) {
        sessionStorage.setItem('nv_admin_token', data.token);
        sessionStorage.setItem('nv_admin_pass', entered);
        this.adminPassword = entered;
        this.closeAllModals();
        this.showToast('✅ Авторизация успешна! Панель администратора открыта.', 'success');
        this.openAdminModal();
        return;
      }
    } catch (e) {
      console.warn('Admin login request failed, fallback to local check', e);
    }

    if (entered === this.adminPassword || entered === 'admin123') {
      sessionStorage.setItem('nv_admin_token', 'local-admin-token');
      sessionStorage.setItem('nv_admin_pass', entered);
      this.closeAllModals();
      this.showToast('✅ Авторизация успешна!', 'success');
      this.openAdminModal();
    } else {
      input.classList.add('input-error-shake');
      setTimeout(() => input.classList.remove('input-error-shake'), 400);
      this.showToast('❌ Неверный пароль администратора!', 'error');
    }
  }

  togglePasswordVisibility() {
    const input = document.getElementById('admin-password-input');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  }

  logoutAdmin() {
    sessionStorage.removeItem('nv_admin_token');
    sessionStorage.removeItem('nv_admin_pass');
    sessionStorage.removeItem('nv_admin_logged_in');
    this.closeAllModals();
    this.showToast('🚪 Вы вышли из режима администратора', 'info');
  }

  async promptChangePassword() {
    const current = prompt('Введите текущий пароль администратора:');
    if (current === null) return;
    if (current !== this.adminPassword && current !== 'admin123') {
      this.showToast('❌ Неверный текущий пароль!', 'error');
      return;
    }

    const newPass = prompt('Введите новый пароль (минимум 3 символа):');
    if (newPass === null) return;
    if (newPass.trim().length < 3) {
      this.showToast('⚠️ Пароль должен содержать минимум 3 символа!', 'warning');
      return;
    }

    try {
      const token = sessionStorage.getItem('nv_admin_token') || '';
      await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
          'X-Admin-Password': this.adminPassword
        },
        body: JSON.stringify({ new_password: newPass.trim() })
      });
    } catch (e) {}

    this.adminPassword = newPass.trim();
    localStorage.setItem('nv_admin_pass', this.adminPassword);
    sessionStorage.setItem('nv_admin_pass', this.adminPassword);
    this.showToast('🔒 Новый пароль администратора успешно сохранен!', 'success');
  }

  renderAdminProductsList() {
    const list = document.getElementById('admin-products-list');
    if (!list) return;

    list.innerHTML = this.products.map(p => `
      <div class="admin-product-row">
        <div class="admin-row-left">
          <img src="${(p.images && p.images[0]) || 'assets/logo.jpg'}" class="admin-row-thumb" onerror="this.src='assets/logo.jpg'"/>
          <div>
            <strong>${p.title}</strong>
            <div class="admin-row-meta">${p.category} | ${p.price} ₽ | Фото: ${p.images ? p.images.length : 0} шт.</div>
          </div>
        </div>
        <div class="admin-row-actions">
          <button class="action-btn outline-btn btn-xs" onclick="window.app.editProductInAdmin('${p.id}')">✏️ Ред.</button>
          <button class="action-btn danger-btn btn-xs" onclick="window.app.deleteProduct('${p.id}')">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  resetAdminForm() {
    this.adminCurrentEditingId = null;
    this.adminAttachedImages = [];
    document.getElementById('admin-form-title').textContent = '➕ Добавить новый товар';
    document.getElementById('admin-prod-id').value = '';
    document.getElementById('admin-prod-title').value = '';
    document.getElementById('admin-prod-category').value = 'resourcepack';
    document.getElementById('admin-prod-price').value = '199';
    document.getElementById('admin-prod-badge').value = 'NEW';
    document.getElementById('admin-prod-tags').value = 'PvP, 16x';
    document.getElementById('admin-prod-shortdesc').value = '';
    document.getElementById('admin-prod-fulldesc').value = '';
    document.getElementById('admin-prod-features').value = '';
    document.getElementById('admin-prod-download').value = '';
    document.getElementById('admin-img-url-input').value = '';
    this.renderAdminAttachedImages();
  }

  editProductInAdmin(productId) {
    const p = this.products.find(item => item.id === productId);
    if (!p) return;

    this.adminCurrentEditingId = p.id;
    this.adminAttachedImages = [...(p.images || [])];

    document.getElementById('admin-form-title').textContent = `✏️ Редактирование: ${p.title}`;
    document.getElementById('admin-prod-id').value = p.id;
    document.getElementById('admin-prod-title').value = p.title;
    document.getElementById('admin-prod-category').value = p.category;
    document.getElementById('admin-prod-price').value = p.price;
    document.getElementById('admin-prod-badge').value = p.badge || '';
    document.getElementById('admin-prod-tags').value = (p.tags || []).join(', ');
    document.getElementById('admin-prod-shortdesc').value = p.shortDesc || '';
    document.getElementById('admin-prod-fulldesc').value = p.fullDesc || '';
    document.getElementById('admin-prod-features').value = (p.features || []).join('\n');
    document.getElementById('admin-prod-download').value = p.downloadUrl || '';

    this.renderAdminAttachedImages();
    document.getElementById('admin-editor-form').scrollIntoView({ behavior: 'smooth' });
  }

  handlePhotoUpload(inputElement) {
    const files = inputElement.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.adminAttachedImages.push(e.target.result);
        this.renderAdminAttachedImages();
        this.showToast(`📸 Фото "${file.name}" прикреплено!`, 'info');
      };
      reader.readAsDataURL(file);
    });

    inputElement.value = '';
  }

  addPhotoByUrl() {
    const input = document.getElementById('admin-img-url-input');
    const url = input.value.trim();
    if (!url) return;

    this.adminAttachedImages.push(url);
    input.value = '';
    this.renderAdminAttachedImages();
    this.showToast('Ссылка на изображение добавлена!', 'info');
  }

  removeAttachedImage(index) {
    this.adminAttachedImages.splice(index, 1);
    this.renderAdminAttachedImages();
  }

  renderAdminAttachedImages() {
    const container = document.getElementById('admin-attached-thumbnails');
    if (!container) return;

    if (this.adminAttachedImages.length === 0) {
      container.innerHTML = '<span class="text-muted text-sm">Фотографии еще не прикреплены. Загрузите файлы с компьютера или укажите ссылку.</span>';
      return;
    }

    container.innerHTML = this.adminAttachedImages.map((src, idx) => `
      <div class="attached-thumb-box">
        <img src="${src}" alt="Attached ${idx + 1}" onerror="this.src='assets/logo.jpg'"/>
        <button type="button" class="remove-photo-btn" onclick="window.app.removeAttachedImage(${idx})">✕</button>
        <span class="photo-idx-badge">${idx === 0 ? 'Главное' : idx + 1}</span>
      </div>
    `).join('');
  }

  async saveProductFromAdmin() {
    const title = document.getElementById('admin-prod-title').value.trim();
    if (!title) {
      this.showToast('⚠️ Введите название товара!', 'warning');
      return;
    }

    const category = document.getElementById('admin-prod-category').value;
    const price = parseInt(document.getElementById('admin-prod-price').value, 10) || 0;
    const badge = document.getElementById('admin-prod-badge').value.trim();
    const tagsRaw = document.getElementById('admin-prod-tags').value;
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const shortDesc = document.getElementById('admin-prod-shortdesc').value.trim();
    const fullDesc = document.getElementById('admin-prod-fulldesc').value.trim();
    const featuresRaw = document.getElementById('admin-prod-features').value;
    const features = featuresRaw.split('\n').map(f => f.trim()).filter(f => f.length > 0);
    const downloadUrl = document.getElementById('admin-prod-download').value.trim();

    const id = this.adminCurrentEditingId || `prod-${Date.now()}`;
    const newProduct = {
      id,
      title,
      category,
      price,
      badge,
      badgeType: price === 0 ? 'free' : (badge === 'NEW' ? 'new' : 'hot'),
      tags,
      shortDesc,
      fullDesc: fullDesc || shortDesc,
      features,
      downloadUrl: downloadUrl || 'https://example.com/download.zip',
      images: this.adminAttachedImages.length > 0 ? this.adminAttachedImages : ['assets/logo.jpg']
    };

    if (this.adminCurrentEditingId) {
      const idx = this.products.findIndex(p => p.id === this.adminCurrentEditingId);
      if (idx !== -1) {
        this.products[idx] = newProduct;
      }
      this.showToast(`✅ Товар "${title}" успешно обновлен!`, 'success');
    } else {
      this.products.unshift(newProduct);
      this.showToast(`🎉 Новый товар "${title}" успешно добавлен в магазин!`, 'success');
    }

    await this.saveProducts();
    this.renderProducts();
    this.renderAdminProductsList();
    this.resetAdminForm();
  }

  async deleteProduct(productId) {
    if (!confirm('Вы действительно хотите удалить этот товар из магазина?')) return;
    this.products = this.products.filter(p => p.id !== productId);
    await this.saveProducts();
    this.renderProducts();
    this.renderAdminProductsList();
    this.showToast('🗑️ Товар удален из каталога для всех устройств!', 'info');
  }

  async resetToDefaultCatalog() {
    if (!confirm('Восстановить исходный каталог товаров? Пользовательские изменения будут сброшены.')) return;
    this.products = [...DEFAULT_PRODUCTS];
    await this.saveProducts();
    this.renderProducts();
    this.renderAdminProductsList();
    this.showToast('Каталог сброшен к исходному для всех устройств!', 'info');
  }

  exportCatalogJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.products, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "namelees_visual_products.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    this.showToast('Файл товаров скачан на компьютер!', 'success');
  }

  // --- Admin SQLite Users Database Viewer ---
  async toggleAdminUsersView() {
    const layoutGrid = document.querySelector('.admin-layout-grid');
    const usersView = document.getElementById('admin-users-view');
    const promosView = document.getElementById('admin-promos-view');
    const toggleBtn = document.getElementById('admin-toggle-users-btn');
    const togglePromosBtn = document.getElementById('admin-toggle-promos-btn');
    const toggleRouletteBtn = document.getElementById('admin-toggle-roulette-btn');
    const rouletteView = document.getElementById('admin-roulette-view');
    if (!layoutGrid || !usersView) return;

    if (usersView.style.display === 'none') {
      layoutGrid.style.display = 'none';
      if (promosView) promosView.style.display = 'none';
      if (rouletteView) rouletteView.style.display = 'none';
      usersView.style.display = 'block';
      if (toggleBtn) {
        toggleBtn.textContent = '📦 К товарам';
        toggleBtn.classList.remove('primary-btn');
        toggleBtn.classList.add('outline-btn');
      }
      if (togglePromosBtn) {
        togglePromosBtn.textContent = '🎟️ База промокодов';
        togglePromosBtn.classList.remove('outline-btn');
        togglePromosBtn.classList.add('primary-btn');
      }
      if (toggleRouletteBtn) {
        toggleRouletteBtn.textContent = '🎡 Призы рулетки';
        toggleRouletteBtn.classList.remove('outline-btn');
        toggleRouletteBtn.classList.add('primary-btn');
      }
      await this.loadAdminUsers();
    } else {
      layoutGrid.style.display = 'grid';
      usersView.style.display = 'none';
      if (promosView) promosView.style.display = 'none';
      if (rouletteView) rouletteView.style.display = 'none';
      if (toggleBtn) {
        toggleBtn.textContent = '👥 База игроков';
        toggleBtn.classList.remove('outline-btn');
        toggleBtn.classList.add('primary-btn');
      }
    }
  }

  // --- Admin Promocodes Database Manager ---
  async toggleAdminPromosView() {
    const layoutGrid = document.querySelector('.admin-layout-grid');
    const usersView = document.getElementById('admin-users-view');
    const promosView = document.getElementById('admin-promos-view');
    const rouletteView = document.getElementById('admin-roulette-view');
    const togglePromosBtn = document.getElementById('admin-toggle-promos-btn');
    const toggleUsersBtn = document.getElementById('admin-toggle-users-btn');
    const toggleRouletteBtn = document.getElementById('admin-toggle-roulette-btn');
    if (!promosView) return;

    if (promosView.style.display === 'none') {
      if (layoutGrid) layoutGrid.style.display = 'none';
      if (usersView) usersView.style.display = 'none';
      if (rouletteView) rouletteView.style.display = 'none';
      promosView.style.display = 'block';

      if (togglePromosBtn) {
        togglePromosBtn.textContent = '📦 К товарам';
        togglePromosBtn.classList.remove('primary-btn');
        togglePromosBtn.classList.add('outline-btn');
      }
      if (toggleUsersBtn) {
        toggleUsersBtn.textContent = '👥 База игроков';
        toggleUsersBtn.classList.remove('outline-btn');
        toggleUsersBtn.classList.add('primary-btn');
      }
      if (toggleRouletteBtn) {
        toggleRouletteBtn.textContent = '🎡 Призы рулетки';
        toggleRouletteBtn.classList.remove('outline-btn');
        toggleRouletteBtn.classList.add('primary-btn');
      }
      await this.loadAdminPromos();
    } else {
      if (layoutGrid) layoutGrid.style.display = 'grid';
      promosView.style.display = 'none';
      if (usersView) usersView.style.display = 'none';
      if (rouletteView) rouletteView.style.display = 'none';

      if (togglePromosBtn) {
        togglePromosBtn.textContent = '🎟️ База промокодов';
        togglePromosBtn.classList.remove('outline-btn');
        togglePromosBtn.classList.add('primary-btn');
      }
    }
  }

  // --- Admin Roulette Items Manager ---
  async toggleAdminRouletteView() {
    const layoutGrid = document.querySelector('.admin-layout-grid');
    const usersView = document.getElementById('admin-users-view');
    const promosView = document.getElementById('admin-promos-view');
    const rouletteView = document.getElementById('admin-roulette-view');
    const toggleRouletteBtn = document.getElementById('admin-toggle-roulette-btn');
    const togglePromosBtn = document.getElementById('admin-toggle-promos-btn');
    const toggleUsersBtn = document.getElementById('admin-toggle-users-btn');
    if (!rouletteView) return;

    if (rouletteView.style.display === 'none') {
      if (layoutGrid) layoutGrid.style.display = 'none';
      if (usersView) usersView.style.display = 'none';
      if (promosView) promosView.style.display = 'none';
      rouletteView.style.display = 'block';

      if (toggleRouletteBtn) {
        toggleRouletteBtn.textContent = '📦 К товарам';
        toggleRouletteBtn.classList.remove('primary-btn');
        toggleRouletteBtn.classList.add('outline-btn');
      }
      if (togglePromosBtn) {
        togglePromosBtn.textContent = '🎟️ База промокодов';
        togglePromosBtn.classList.remove('outline-btn');
        togglePromosBtn.classList.add('primary-btn');
      }
      if (toggleUsersBtn) {
        toggleUsersBtn.textContent = '👥 База игроков';
        toggleUsersBtn.classList.remove('outline-btn');
        toggleUsersBtn.classList.add('primary-btn');
      }
      await this.loadAdminRouletteItems();
    } else {
      if (layoutGrid) layoutGrid.style.display = 'grid';
      rouletteView.style.display = 'none';
      if (usersView) usersView.style.display = 'none';
      if (promosView) promosView.style.display = 'none';

      if (toggleRouletteBtn) {
        toggleRouletteBtn.textContent = '🎡 Призы рулетки';
        toggleRouletteBtn.classList.remove('outline-btn');
        toggleRouletteBtn.classList.add('primary-btn');
      }
    }
  }

  async loadAdminRouletteItems() {
    const container = document.getElementById('admin-roulette-table-container');
    if (!container) return;
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">⏳ Загрузка призов рулетки из SQLite...</p>';

    const token = sessionStorage.getItem('nv_admin_token') || '';
    const pass = sessionStorage.getItem('nv_admin_pass') || this.adminPassword || 'admin123';
    const authToken = localStorage.getItem('nv_auth_token') || '';

    try {
      const res = await fetch(`/api/admin/roulette-items?admin_pass=${encodeURIComponent(pass)}`, {
        headers: {
          'X-Admin-Token': token,
          'X-Admin-Password': pass,
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        }
      });
      const data = await res.json();
      if (data && data.success && data.items) {
        this.cachedAdminRouletteItems = data.items;
        if (data.items.length === 0) {
          container.innerHTML = `
            <div style="text-align: center; padding: 24px;">
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 12px;">В рулетке пока нет призов. Добавьте первый!</p>
              <button class="action-btn primary-btn btn-sm" onclick="window.app.openRouletteItemEditor()">➕ Добавить предмет</button>
            </div>
          `;
          return;
        }

        const totalWeight = data.items.reduce((sum, it) => sum + (it.is_active ? (Number(it.weight) || 10) : 0), 0) || 1;

        container.innerHTML = `
          <div style="overflow-x: auto;">
            <table class="admin-roulette-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Сектор / Иконка</th>
                  <th>Тип</th>
                  <th>Награда</th>
                  <th>Редкость</th>
                  <th>Вес / Шанс</th>
                  <th>Статус</th>
                  <th style="text-align: right;">Действия</th>
                </tr>
              </thead>
              <tbody>
                ${data.items.map(it => {
                  const pct = it.is_active ? (((Number(it.weight) || 10) / totalWeight) * 100).toFixed(1) : 0;
                  let rewardVal = '—';
                  if (it.type === 'rubles') rewardVal = `<strong style="color: #fbbf24;">+${it.amount} ₽</strong> на баланс`;
                  else if (it.type === 'promo') rewardVal = `<span class="promo-code-pill">${it.code}</span> (-${it.discount}%)`;
                  else if (it.type === 'item') rewardVal = `<span style="color: #38bdf8;">📦 ${it.title}</span>`;

                  return `
                    <tr>
                      <td style="color: var(--text-muted);">${it.display_order || it.id}</td>
                      <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <span style="font-size: 1.3rem;">${it.icon || '🎁'}</span>
                          <div>
                            <strong style="color: ${it.text_color || '#fff'}; font-size: 0.9rem;">${it.title}</strong>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">${it.full_title}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">
                          ${it.type === 'rubles' ? '💵 Баланс' : (it.type === 'promo' ? '🎟️ Промокод' : '📦 Конфиг')}
                        </span>
                      </td>
                      <td>${rewardVal}</td>
                      <td><span class="rarity-pill ${it.rarity}">${it.rarity}</span></td>
                      <td>
                        <span class="chance-weight-badge">Вес: ${it.weight}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 4px;">(~${pct}%)</span>
                      </td>
                      <td>
                        <span class="promo-status-badge ${it.is_active ? 'active' : 'inactive'}">
                          ${it.is_active ? '🟢 В игре' : '⚪ Выключен'}
                        </span>
                      </td>
                      <td style="text-align: right;">
                        <div style="display: inline-flex; gap: 6px;">
                          <button class="action-btn outline-btn btn-xs" onclick="window.app.openRouletteItemEditor(${it.id})" title="Редактировать">✏️</button>
                          <button class="action-btn danger-btn btn-xs" onclick="window.app.deleteAdminRouletteItem(${it.id})" title="Удалить">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        container.innerHTML = `<p style="color: #f87171; font-size: 0.9rem;">Ошибка: ${data ? data.message : 'Не удалось загрузить призы'}</p>`;
      }
    } catch (e) {
      container.innerHTML = `<p style="color: #f87171; font-size: 0.9rem;">Ошибка соединения: ${e.message}</p>`;
    }
  }

  handleRouletteTypeChange() {
    const type = document.getElementById('admin-roulette-type')?.value || 'rubles';
    const grpAmount = document.getElementById('admin-roulette-group-amount');
    const grpCode = document.getElementById('admin-roulette-group-code');
    const grpDiscount = document.getElementById('admin-roulette-group-discount');

    if (grpAmount) grpAmount.style.display = (type === 'rubles') ? 'block' : 'none';
    if (grpCode) grpCode.style.display = (type === 'promo') ? 'block' : 'none';
    if (grpDiscount) grpDiscount.style.display = (type === 'promo') ? 'block' : 'none';
  }

  openRouletteItemEditor(itemId = null) {
    const formWrap = document.getElementById('admin-roulette-form-wrap');
    const titleEl = document.getElementById('admin-roulette-form-title');
    if (!formWrap) return;

    if (itemId && this.cachedAdminRouletteItems) {
      const it = this.cachedAdminRouletteItems.find(x => x.id === itemId);
      if (it) {
        if (titleEl) titleEl.textContent = `✏️ Редактировать приз «${it.title}»`;
        document.getElementById('admin-roulette-id').value = it.id;
        document.getElementById('admin-roulette-key').value = it.item_key || '';
        document.getElementById('admin-roulette-type').value = it.type || 'rubles';
        document.getElementById('admin-roulette-title').value = it.title || '';
        document.getElementById('admin-roulette-fulltitle').value = it.full_title || '';
        document.getElementById('admin-roulette-amount').value = it.amount || 0;
        document.getElementById('admin-roulette-code').value = it.code || '';
        document.getElementById('admin-roulette-discount').value = it.discount || 0;
        document.getElementById('admin-roulette-rarity').value = it.rarity || 'common';
        document.getElementById('admin-roulette-icon').value = it.icon || '🎁';
        document.getElementById('admin-roulette-weight').value = it.weight || 10;
        document.getElementById('admin-roulette-order').value = it.display_order || 0;
        document.getElementById('admin-roulette-color').value = it.color || '#172554';
        document.getElementById('admin-roulette-active').checked = !!it.is_active;
        this.handleRouletteTypeChange();
        formWrap.style.display = 'block';
        formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    // New item
    if (titleEl) titleEl.textContent = '➕ Добавить новый приз в рулетку';
    document.getElementById('admin-roulette-id').value = '';
    document.getElementById('admin-roulette-key').value = '';
    document.getElementById('admin-roulette-type').value = 'rubles';
    document.getElementById('admin-roulette-title').value = '';
    document.getElementById('admin-roulette-fulltitle').value = '';
    document.getElementById('admin-roulette-amount').value = '100';
    document.getElementById('admin-roulette-code').value = '';
    document.getElementById('admin-roulette-discount').value = '20';
    document.getElementById('admin-roulette-rarity').value = 'common';
    document.getElementById('admin-roulette-icon').value = '🪙';
    document.getElementById('admin-roulette-weight').value = '20';
    document.getElementById('admin-roulette-order').value = '0';
    document.getElementById('admin-roulette-color').value = '#172554';
    document.getElementById('admin-roulette-active').checked = true;
    this.handleRouletteTypeChange();
    formWrap.style.display = 'block';
    formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  closeRouletteItemEditor() {
    const formWrap = document.getElementById('admin-roulette-form-wrap');
    if (formWrap) formWrap.style.display = 'none';
  }

  async saveAdminRouletteItem() {
    const id = document.getElementById('admin-roulette-id')?.value;
    const item_key = document.getElementById('admin-roulette-key')?.value;
    const type = document.getElementById('admin-roulette-type')?.value || 'rubles';
    const title = document.getElementById('admin-roulette-title')?.value.trim();
    const full_title = document.getElementById('admin-roulette-fulltitle')?.value.trim();
    const amount = parseFloat(document.getElementById('admin-roulette-amount')?.value) || 0;
    const code = document.getElementById('admin-roulette-code')?.value.trim().toUpperCase();
    const discount = parseInt(document.getElementById('admin-roulette-discount')?.value) || 0;
    const rarity = document.getElementById('admin-roulette-rarity')?.value || 'common';
    const icon = document.getElementById('admin-roulette-icon')?.value.trim() || '🎁';
    const weight = parseInt(document.getElementById('admin-roulette-weight')?.value) || 10;
    const display_order = parseInt(document.getElementById('admin-roulette-order')?.value) || 0;
    const color = document.getElementById('admin-roulette-color')?.value.trim() || '#172554';
    const is_active = document.getElementById('admin-roulette-active')?.checked ? 1 : 0;

    if (!title) {
      this.showToast('⚠️ Укажите краткое название приза (например: 100 ₽ или -25%)', 'warning');
      return;
    }

    const token = sessionStorage.getItem('nv_admin_token') || '';
    const pass = sessionStorage.getItem('nv_admin_pass') || this.adminPassword || 'admin123';
    const authToken = localStorage.getItem('nv_auth_token') || '';

    const payload = {
      id: id ? parseInt(id) : null,
      item_key,
      type,
      title,
      full_title,
      amount,
      code,
      discount,
      rarity,
      icon,
      weight,
      display_order,
      color,
      is_active
    };

    try {
      const res = await fetch('/api/admin/roulette-items/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
          'X-Admin-Password': pass,
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.success) {
        this.showToast(data.message || 'Приз сохранен!', 'success');
        this.closeRouletteItemEditor();
        await this.loadAdminRouletteItems();
        if (window.lootbox && window.lootbox.loadSectors) {
          await window.lootbox.loadSectors();
        }
      } else {
        this.showToast(data ? data.message : 'Ошибка сохранения приза', 'error');
      }
    } catch (e) {
      this.showToast(`Ошибка сохранения: ${e.message}`, 'error');
    }
  }

  async deleteAdminRouletteItem(id) {
    if (!confirm('Вы уверены, что хотите удалить этот предмет из рулетки?')) return;

    const token = sessionStorage.getItem('nv_admin_token') || '';
    const pass = sessionStorage.getItem('nv_admin_pass') || this.adminPassword || 'admin123';
    const authToken = localStorage.getItem('nv_auth_token') || '';

    try {
      const res = await fetch('/api/admin/roulette-items/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
          'X-Admin-Password': pass,
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data && data.success) {
        this.showToast(data.message || 'Приз удален!', 'success');
        await this.loadAdminRouletteItems();
        if (window.lootbox && window.lootbox.loadSectors) {
          await window.lootbox.loadSectors();
        }
      } else {
        this.showToast(data ? data.message : 'Ошибка удаления', 'error');
      }
    } catch (e) {
      this.showToast(`Ошибка удаления: ${e.message}`, 'error');
    }
  }

  async resetAdminRouletteItems() {
    if (!confirm('Сбросить все призы рулетки к исходным 8 секторам? Все изменения будут перезаписаны.')) return;

    const token = sessionStorage.getItem('nv_admin_token') || '';
    const pass = sessionStorage.getItem('nv_admin_pass') || this.adminPassword || 'admin123';
    const authToken = localStorage.getItem('nv_auth_token') || '';

    try {
      const res = await fetch('/api/admin/roulette-items/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
          'X-Admin-Password': pass,
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data && data.success) {
        this.showToast(data.message || 'Призы сброшены к стандартным!', 'success');
        await this.loadAdminRouletteItems();
        if (window.lootbox && window.lootbox.loadSectors) {
          await window.lootbox.loadSectors();
        }
      } else {
        this.showToast(data ? data.message : 'Ошибка сброса', 'error');
      }
    } catch (e) {
      this.showToast(`Ошибка сброса: ${e.message}`, 'error');
    }
  }

  async loadAdminPromos() {
    const container = document.getElementById('admin-promos-table-container');
    if (!container) return;
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">⏳ Загрузка базы промокодов из SQLite...</p>';

    const token = sessionStorage.getItem('nv_admin_token') || '';
    const pass = sessionStorage.getItem('nv_admin_pass') || this.adminPassword || 'admin123';
    const authToken = localStorage.getItem('nv_auth_token') || '';

    try {
      const res = await fetch(`/api/admin/promocodes?admin_pass=${encodeURIComponent(pass)}`, {
        headers: {
          'X-Admin-Token': token,
          'X-Admin-Password': pass,
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        }
      });
      const data = await res.json();
      if (data && data.success && data.promocodes) {
        this.cachedAdminPromos = data.promocodes;
        if (data.promocodes.length === 0) {
          container.innerHTML = `
            <div style="text-align: center; padding: 24px;">
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 12px;">В базе пока нет промокодов на скидку. Добавьте первый!</p>
              <button class="action-btn primary-btn btn-sm" onclick="window.app.openPromoEditor()">➕ Добавить промокод</button>
            </div>
          `;
          return;
        }

        container.innerHTML = `
          <div style="overflow-x: auto;">
            <table class="admin-promo-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Промокод</th>
                  <th>Скидка</th>
                  <th>Описание</th>
                  <th>Статус</th>
                  <th style="text-align: right;">Действия</th>
                </tr>
              </thead>
              <tbody>
                ${data.promocodes.map(p => `
                  <tr>
                    <td style="color: var(--text-muted);">#${p.id}</td>
                    <td><span class="promo-code-pill">${p.code}</span></td>
                    <td><span class="promo-discount-badge">-${p.discount_percent}%</span></td>
                    <td style="color: var(--text-secondary); font-size: 0.82rem;">${p.description || '—'}</td>
                    <td>
                      <span class="promo-status-badge ${p.is_active ? 'active' : 'inactive'}">
                        ${p.is_active ? '🟢 Активен' : '⚪ Выключен'}
                      </span>
                    </td>
                    <td style="text-align: right;">
                      <div class="flex gap-1 justify-end">
                        <button class="action-btn outline-btn btn-xs" onclick="window.app.openPromoEditor(${p.id})" title="Редактировать скидку или код">
                          ✏️ Изменить
                        </button>
                        <button class="action-btn danger-btn btn-xs" onclick="window.app.deleteAdminPromo(${p.id}, '${p.code}')" title="Удалить промокод">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        container.innerHTML = `<p style="color: #f87171; font-size: 0.9rem;">❌ ${(data && data.message) ? data.message : 'Не удалось загрузить промокоды'}</p>`;
      }
    } catch (e) {
      container.innerHTML = '<p style="color: #f87171; font-size: 0.9rem;">❌ Ошибка соединения с сервером</p>';
    }
  }

  openPromoEditor(promoId = null) {
    const wrap = document.getElementById('admin-promo-form-wrap');
    if (!wrap) return;
    wrap.style.display = 'block';

    const titleEl = document.getElementById('admin-promo-form-title');
    const idInput = document.getElementById('admin-promo-id');
    const codeInput = document.getElementById('admin-promo-code');
    const discountInput = document.getElementById('admin-promo-discount');
    const descInput = document.getElementById('admin-promo-desc');
    const activeInput = document.getElementById('admin-promo-active');

    if (promoId && this.cachedAdminPromos) {
      const p = this.cachedAdminPromos.find(x => x.id === promoId);
      if (p) {
        if (titleEl) titleEl.textContent = `✏️ Редактировать промокод «${p.code}»`;
        if (idInput) idInput.value = p.id;
        if (codeInput) codeInput.value = p.code;
        if (discountInput) discountInput.value = p.discount_percent;
        if (descInput) descInput.value = p.description || '';
        if (activeInput) activeInput.checked = !!p.is_active;
        if (codeInput) codeInput.focus();
        return;
      }
    }

    // New Promo
    if (titleEl) titleEl.textContent = '➕ Добавить новый промокод';
    if (idInput) idInput.value = '';
    if (codeInput) { codeInput.value = ''; codeInput.focus(); }
    if (discountInput) discountInput.value = '20';
    if (descInput) descInput.value = '';
    if (activeInput) activeInput.checked = true;
  }

  closePromoEditor() {
    const wrap = document.getElementById('admin-promo-form-wrap');
    if (wrap) wrap.style.display = 'none';
  }

  async saveAdminPromo() {
    const idInput = document.getElementById('admin-promo-id');
    const codeInput = document.getElementById('admin-promo-code');
    const discountInput = document.getElementById('admin-promo-discount');
    const descInput = document.getElementById('admin-promo-desc');
    const activeInput = document.getElementById('admin-promo-active');

    const promoId = idInput && idInput.value ? parseInt(idInput.value, 10) : null;
    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    const discount = discountInput ? parseInt(discountInput.value, 10) : 0;
    const desc = descInput ? descInput.value.trim() : '';
    const isActive = activeInput ? (activeInput.checked ? 1 : 0) : 1;

    if (!code || code.length < 2) {
      this.showToast('⚠️ Введите код промокода (минимум 2 символа)!', 'warning');
      return;
    }
    if (!discount || discount < 1 || discount > 99) {
      this.showToast('⚠️ Укажите скидку от 1% до 99%!', 'warning');
      return;
    }

    const token = sessionStorage.getItem('nv_admin_token') || '';
    const pass = sessionStorage.getItem('nv_admin_pass') || this.adminPassword || 'admin123';
    const authToken = localStorage.getItem('nv_auth_token') || '';

    try {
      const res = await fetch('/api/admin/promocodes/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
          'X-Admin-Password': pass,
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        },
        body: JSON.stringify({
          id: promoId,
          code,
          discount_percent: discount,
          description: desc,
          is_active: isActive
        })
      });
      const data = await res.json();
      if (data && data.success) {
        this.showToast(data.message || '✅ Промокод успешно сохранён!', 'success');
        this.closePromoEditor();
        await this.loadAdminPromos();
      } else {
        this.showToast(`❌ ${(data && data.message) ? data.message : 'Ошибка сохранения'}`, 'error');
      }
    } catch (e) {
      this.showToast('❌ Ошибка связи с сервером', 'error');
    }
  }

  async deleteAdminPromo(id, code) {
    if (!confirm(`Удалить промокод «${code}» из базы данных?`)) return;

    const token = sessionStorage.getItem('nv_admin_token') || '';
    const pass = sessionStorage.getItem('nv_admin_pass') || this.adminPassword || 'admin123';
    const authToken = localStorage.getItem('nv_auth_token') || '';

    try {
      const res = await fetch('/api/admin/promocodes/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
          'X-Admin-Password': pass,
          'Authorization': authToken ? `Bearer ${authToken}` : ''
        },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data && data.success) {
        this.showToast(data.message || '✅ Промокод удален!', 'success');
        await this.loadAdminPromos();
      } else {
        this.showToast(`❌ ${(data && data.message) ? data.message : 'Ошибка удаления'}`, 'error');
      }
    } catch (e) {
      this.showToast('❌ Ошибка связи с сервером', 'error');
    }
  }

  async loadAdminUsers() {
    const container = document.getElementById('admin-users-table-container');
    if (!container) return;
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">⏳ Загрузка базы данных игроков из SQLite...</p>';

    const token = sessionStorage.getItem('nv_admin_token') || '';
    const pass = sessionStorage.getItem('nv_admin_pass') || this.adminPassword || 'admin123';

    try {
      const res = await fetch(`/api/admin/users?admin_pass=${encodeURIComponent(pass)}`, {
        headers: {
          'X-Admin-Token': token,
          'X-Admin-Password': pass
        }
      });
      const data = await res.json();
      if (data && data.success && data.users) {
        if (data.users.length === 0) {
          container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">В базе данных пока нет зарегистрированных игроков.</p>';
          return;
        }
        container.innerHTML = `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.2); color: var(--text-secondary);">
                  <th style="padding: 10px 8px;">ID</th>
                  <th style="padding: 10px 8px;">Игрок / Ник</th>
                  <th style="padding: 10px 8px;">Роль / Статус</th>
                  <th style="padding: 10px 8px;">Email (Почта)</th>
                  <th style="padding: 10px 8px;">Баланс</th>
                  <th style="padding: 10px 8px;">Куплено товаров</th>
                  <th style="padding: 10px 8px;">Дата регистрации</th>
                </tr>
              </thead>
              <tbody>
                ${data.users.map(u => {
                  const purchasesList = (u.purchases && u.purchases.length > 0)
                    ? u.purchases.map(p => `• ${p.title} (${p.price} ₽)`).join('<br>')
                    : '<span style="color: var(--text-muted); font-size: 0.78rem;">Покупок нет</span>';
                  const role = u.vip_status || 'Игрок';
                  return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.07);">
                      <td style="padding: 10px 8px; color: var(--text-muted);">#${u.id}</td>
                      <td style="padding: 10px 8px; font-weight: 700; color: #fff;">${u.nickname}</td>
                      <td style="padding: 10px 8px;">
                        <select onchange="window.app.changeUserRole(${u.id}, this.value, '${u.nickname}')" style="background: #181b2a; border: 1px solid ${role === 'СОЗДАТЕЛЬ' ? '#f43f5e' : (role === 'VIP Игрок' ? '#fbbf24' : '#38bdf8')}; color: ${role === 'СОЗДАТЕЛЬ' ? '#f43f5e' : (role === 'VIP Игрок' ? '#fbbf24' : '#38bdf8')}; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer;">
                          <option value="Игрок" ${role === 'Игрок' ? 'selected' : ''}>🎮 Игрок</option>
                          <option value="VIP Игрок" ${role === 'VIP Игрок' || role === 'VIP' ? 'selected' : ''}>⭐ VIP Игрок</option>
                          <option value="СОЗДАТЕЛЬ" ${role === 'СОЗДАТЕЛЬ' ? 'selected' : ''}>👑 СОЗДАТЕЛЬ</option>
                        </select>
                      </td>
                      <td style="padding: 10px 8px; color: #38bdf8;">${u.email}</td>
                      <td style="padding: 10px 8px; color: #4ade80; font-weight: 800; font-size: 0.95rem;">${u.balance} ₽</td>
                      <td style="padding: 10px 8px; font-size: 0.82rem; line-height: 1.4;">${purchasesList}</td>
                      <td style="padding: 10px 8px; color: var(--text-muted); font-size: 0.78rem;">${u.created_at || ''}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="text-align: center; padding: 24px 16px;">
            <div style="font-size: 36px; margin-bottom: 10px;">🔒</div>
            <p style="color: #f87171; font-weight: 600; margin-bottom: 14px;">${data.message || 'Требуется авторизация администратора'}</p>
            <button class="action-btn primary-btn btn-sm" onclick="window.app.promptForAdminPassAndReload()">
              🔑 Ввести пароль администратора
            </button>
          </div>
        `;
      }
    } catch (e) {
      container.innerHTML = `<p style="color: #f87171;">❌ Ошибка соединения с сервером базы данных: ${e.message}</p>`;
    }
  }

  async changeUserRole(userId, newRole, nickname) {
    const token = sessionStorage.getItem('nv_admin_token') || '';
    const pass = sessionStorage.getItem('nv_admin_pass') || this.adminPassword || 'admin123';

    try {
      const res = await fetch('/api/admin/set-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
          'X-Admin-Password': pass
        },
        body: JSON.stringify({ user_id: userId, status: newRole })
      });
      const data = await res.json();
      if (data && data.success) {
        this.showToast(`✅ Статус игрока ${nickname || ''} изменён на «${newRole}»!`, 'success');
        // If changing current user's role, sync immediately
        if (this.currentUser && this.currentUser.id === userId) {
          this.currentUser.vip_status = newRole;
          this.initProfilePage();
          this.updateUserUI();
        }
        await this.loadAdminUsers();
      } else {
        this.showToast(`❌ ${data.message || 'Не удалось изменить статус'}`, 'error');
      }
    } catch (e) {
      this.showToast(`❌ Ошибка запроса: ${e.message}`, 'error');
    }
  }

  async promptForAdminPassAndReload() {
    const pass = prompt('Введите пароль администратора (по умолчанию: admin123):');
    if (!pass) return;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass.trim() })
      });
      const data = await res.json();
      if (data && data.success) {
        sessionStorage.setItem('nv_admin_token', data.token);
        sessionStorage.setItem('nv_admin_pass', pass.trim());
        this.adminPassword = pass.trim();
        this.showToast('✅ Авторизация успешна!', 'success');
        await this.loadAdminUsers();
        return;
      }
    } catch (e) {}
    this.showToast('❌ Неверный пароль администратора!', 'error');
  }

  // --- Common Modals & Toasts ---
  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      if (m.id === 'auth-modal-backdrop' && !this.currentUser) return;
      m.classList.remove('active');
    });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  // --- Settings Page Handler ---
  initSettingsPage() {
    const emailEl = document.getElementById('settings-email');
    if (!emailEl) return; // Not on settings page

    const authWarning = document.getElementById('settings-auth-warning');
    const contentWrap = document.getElementById('settings-content-wrap');

    if (!this.currentUser) {
      if (authWarning) authWarning.style.display = 'block';
      if (contentWrap) contentWrap.style.display = 'none';
      return;
    }

    if (authWarning) authWarning.style.display = 'none';
    if (contentWrap) contentWrap.style.display = 'grid';

    // Populate user account fields
    emailEl.value = this.currentUser.email || '';
    
    const nickEl = document.getElementById('settings-nickname');
    if (nickEl) nickEl.textContent = this.currentUser.nickname || this.currentUser.email.split('@')[0];

    const roleEl = document.getElementById('settings-role-badge');
    if (roleEl) {
      const role = this.currentUser.vip_status || 'Игрок';
      roleEl.textContent = role;
      roleEl.className = 'role-badge ' + (role === 'СОЗДАТЕЛЬ' ? 'creator' : (role.includes('VIP') ? 'vip' : 'player'));
    }

    const regEl = document.getElementById('settings-reg-date');
    if (regEl) {
      const rawDate = this.currentUser.created_at || '';
      if (rawDate) {
        try {
          const d = new Date(rawDate.replace(' ', 'T'));
          regEl.textContent = d.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        } catch (e) {
          regEl.textContent = rawDate;
        }
      } else {
        regEl.textContent = 'Недавно';
      }
    }

    const balEl = document.getElementById('settings-balance-val');
    if (balEl) {
      balEl.textContent = this.formatBalance(this.currentUser.balance || this.currentUser.balanceRub || 0);
    }
  }

  async changePassword(e) {
    if (e) e.preventDefault();
    if (!this.currentUser) {
      this.showToast('⚠️ Сначала войдите в свой аккаунт!', 'warning');
      this.openAuthModal('login');
      return;
    }

    const oldPassEl = document.getElementById('settings-old-pass');
    const newPassEl = document.getElementById('settings-new-pass');
    const confirmPassEl = document.getElementById('settings-confirm-pass');
    const submitBtn = document.getElementById('settings-save-pass-btn');

    const oldPass = oldPassEl ? oldPassEl.value.trim() : '';
    const newPass = newPassEl ? newPassEl.value.trim() : '';
    const confirmPass = confirmPassEl ? confirmPassEl.value.trim() : '';

    if (!oldPass) {
      this.showToast('⚠️ Введите текущий (старый) пароль', 'warning');
      if (oldPassEl) oldPassEl.focus();
      return;
    }
    if (!newPass) {
      this.showToast('⚠️ Введите новый пароль', 'warning');
      if (newPassEl) newPassEl.focus();
      return;
    }
    if (newPass.length < 4) {
      this.showToast('⚠️ Новый пароль должен содержать не менее 4 символов', 'warning');
      if (newPassEl) newPassEl.focus();
      return;
    }
    if (newPass !== confirmPass) {
      this.showToast('❌ Новый пароль и подтверждение не совпадают!', 'error');
      if (confirmPassEl) confirmPassEl.focus();
      return;
    }
    if (oldPass === newPass) {
      this.showToast('ℹ️ Новый пароль совпадает со старым', 'warning');
      return;
    }

    const token = localStorage.getItem('nv_auth_token') || '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Сохранение...';
    }

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          old_password: oldPass,
          new_password: newPass
        })
      });

      const data = await res.json();
      if (data && data.success) {
        if (data.token) {
          localStorage.setItem('nv_auth_token', data.token);
        }
        this.showToast(data.message || '🎉 Пароль успешно изменен!', 'success');
        if (oldPassEl) oldPassEl.value = '';
        if (newPassEl) newPassEl.value = '';
        if (confirmPassEl) confirmPassEl.value = '';
      } else {
        this.showToast(`❌ ${(data && data.message) ? data.message : 'Ошибка смены пароля'}`, 'error');
      }
    } catch (err) {
      this.showToast(`❌ Ошибка соединения с сервером: ${err.message}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Сохранить новый пароль';
      }
    }
  }

  togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) icon.textContent = '🙈';
    } else {
      input.type = 'password';
      if (icon) icon.textContent = '👁️';
    }
  }
}

window.app = new App();
