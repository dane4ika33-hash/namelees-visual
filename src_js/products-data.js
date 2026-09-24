// Начальный каталог товаров для Nameless Visual
const DEFAULT_PRODUCTS = [
  {
    id: "rp-nebula-pvp",
    title: "Nebula 16x PvP Pack",
    category: "resourcepack",
    badge: "ХИТ ПРОДАЖ",
    badgeType: "hot",
    price: 199,
    tags: ["16x", "PvP", "FunTime", "1.16 - 1.21"],
    shortDesc: "Топовый приватный ресурспак в фиолетовых тонах с компактными тотемами, чистым небом и мягкими партиклами.",
    fullDesc: "Nebula 16x — авторский ресурспак от Nameless Visual, созданный специально для анархии и PvP-серверов. Все текстуры переработаны для максимальной видимости в бою, не загромождают экран и дают прирост до +25% FPS за счет оптимизации моделей.",
    features: [
      "Компактный тотем и кристаллы, не закрывающие обзор",
      "Яркие индикаторы хитбоксов и критов",
      "Кастомное космическое фиолетовое небо",
      "Оптимизированные текстуры мечей и брони",
      "Звуки ударов и поедания еды высокой четкости"
    ],
    downloadUrl: "https://example.com/download/nebula-16x.zip",
    images: [
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80"
    ]
  },
  {
    id: "rp-phantom-dark",
    title: "Phantom Dark 32x",
    category: "resourcepack",
    badge: "NEW",
    badgeType: "new",
    price: 249,
    tags: ["32x", "Dark Mode", "ReallyWorld", "1.20+"],
    shortDesc: "Стильный темный минималистичный текстурпак с эффектом неонового свечения для брони и оружия.",
    fullDesc: "Премиальный текстурпак для ценителей темных минималистичных интерфейсов в стиле Pulse Visuals. Включает темный GUI инвентаря, неоновые акценты на незеритовой и алмазной броне, а также кастомные анимации зачарований.",
    features: [
      "Темный полупрозрачный интерфейс (Glass GUI)",
      "Неоновые контуры алмазной и незеритовой брони",
      "Уникальные иконки зелий и эффектов",
      "Отображение прочности предметов прямо на иконке"
    ],
    downloadUrl: "https://example.com/download/phantom-dark-32x.zip",
    images: [
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80"
    ]
  },
  {
    id: "cfg-pulse-pvp",
    title: "Pulse-Style PvP Config Pack",
    category: "config",
    badge: "PRO CONFIG",
    badgeType: "pro",
    price: 299,
    tags: ["FunTime", "ReallyWorld", "Hitboxes", "Legit"],
    shortDesc: "Профессиональный конфиг под актуальные моды с идеальной настройкой визуала, индикаторов и партиклов.",
    fullDesc: "Максимально выверенный конфиг для PvP-модов и визуала. Настроен Target HUD, индикаторы здоровья, дистанция до цели, Hit-эффекты и оптимизация рендера, позволяющая выжать максимум производительности.",
    features: [
      "Идеальный Target HUD в стиле Pulse Visuals",
      "Индикаторы Low HP и счетчик комбо-ударов",
      "Кастомные трейлы и партиклы урона",
      "Плавная анимация взмахов меча без лагов",
      "Готовые пресеты под сервера FunTime и HolyWorld"
    ],
    downloadUrl: "https://example.com/download/pulse-cfg-pro.zip",
    images: [
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1563089145-599997674d42?w=800&auto=format&fit=crop&q=80"
    ]
  },
  {
    id: "cfg-fps-booster",
    title: "Max FPS Booster Config (Fabric/Opti)",
    category: "config",
    badge: "РЕКОМЕНДУЕМ",
    badgeType: "hot",
    price: 149,
    tags: ["FPS +100%", "Sodium", "Lithium", "No Lag"],
    shortDesc: "Конфиг глубокой оптимизации графики и памяти для стабильных 144+ FPS даже на слабых ноутбуках.",
    fullDesc: "Полный набор конфигурационных файлов для Sodium, FerriteCore, Entity Culling, ImmediatelyFast и других модов оптимизации. Убирает микрофризы во время крупных замесов и взрывов кристаллов.",
    features: [
      "Отключение скрытых тяжелых анимаций частиц",
      "Оптимизация рендера чанков и сущностей",
      "Снижение задержки ввода (Input Lag) на 40%",
      "Подробная инструкция по установке за 1 минуту"
    ],
    downloadUrl: "https://example.com/download/fps-booster-cfg.zip",
    images: [
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80"
    ]
  },
  {
    id: "rp-free-starter",
    title: "Starter Visual 16x (Free Pack)",
    category: "resourcepack",
    badge: "БЕСПЛАТНО",
    badgeType: "free",
    price: 0,
    tags: ["Бесплатно", "16x", "Старт", "PvP"],
    shortDesc: "Базовый бесплатный пак от Nameless Visual для знакомства с нашими текстурами.",
    fullDesc: "Качественный бесплатный ресурспак с компактными мечами, приятным прицелом и улучшенными текстурами руд и шерсти. Отличный выбор для быстрого старта без вложений.",
    features: [
      "Удобный прицел-точка для точных ударов",
      "Компактный размер файла (быстрая загрузка)",
      "Поддержка всех версий от 1.12 до 1.21"
    ],
    downloadUrl: "https://example.com/download/free-starter-16x.zip",
    images: [
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80"
    ]
  },
  {
    id: "cfg-custom-hud",
    title: "Clean HUD & Crosshairs Config",
    category: "config",
    badge: "VIP",
    badgeType: "pro",
    price: 179,
    tags: ["HUD", "Прицелы", "Минимализм"],
    shortDesc: "Сборник из 15 стильных прицелов и кастомной панели брони и зелий над хотбаром.",
    fullDesc: "Эстетичный конфиг интерфейса: компактное отображение прочности брони, таймеры действующих зелий прямо на экране и 15 вариантов прицелов (точка, круг, крест, неоновые стрелки).",
    features: [
      "15 сменных прицелов высокой четкости",
      "Мини-индикатор брони и надетого тотема",
      "Таймеры баффов и дебаффов в секундах"
    ],
    downloadUrl: "https://example.com/download/clean-hud-cfg.zip",
    images: [
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80"
    ]
  }
];
