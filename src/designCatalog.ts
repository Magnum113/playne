export const designSections = [
  ["principles", "Принципы Playne"],
  ["foundations", "Цвета и темы"],
  ["type", "Типографика"],
  ["layout", "Размеры и отступы"],
  ["brand", "Логотип и иконки"],
  ["actions", "Кнопки и ссылки"],
  ["forms", "Поля и выбор"],
  ["navigation", "Навигация"],
  ["cards", "Карточки игр"],
  ["motion", "Движение и реакции"],
  ["gameplay", "Игровые компоненты"],
  ["results", "Результаты и рейтинг"],
  ["overlays", "Модальные окна"],
  ["feedback", "Состояния"],
  ["content", "Текст и футер"],
  ["artwork", "Все иллюстрации"],
  ["contracts", "Правила компонентов"],
  ["inventory", "Состав системы"],
  ["audit", "Что исправлено"],
] as const;

export const tokenGroups = [
  {
    title: "Поверхности",
    tokens: ["--bg", "--panel", "--hover", "--line", "--line-strong", "--grid"],
  },
  {
    title: "Текст и акценты",
    tokens: ["--text", "--muted", "--mint", "--purple", "--orange", "--actual"],
  },
  {
    title: "Мягкие цвета",
    tokens: [
      "--mint-soft",
      "--purple-soft",
      "--mint-tint",
      "--purple-tint",
      "--orange-tint",
      "--illustration-cutout",
    ],
  },
  {
    title: "Сообщения и управление",
    tokens: [
      "--danger",
      "--danger-tint",
      "--focus",
      "--field-border",
      "--button-text",
      "--button-hover",
    ],
  },
] as const;

// The source paths identify the production components used by these examples.
export const componentInventory = [
  [
    "Серия в шапке: огонь, число, загрузка и ошибка",
    "HeaderStreak.tsx · HeaderStreakLink · SiteHeader.tsx",
    "navigation",
  ],
  [
    "Личная ударная серия и календарь без ссылки на текущую страницу",
    "PlayStreak.tsx · ReturnExamples.tsx",
    "results",
  ],
  [
    "Компактные мобильные топ-5 очков и серий",
    "OverallLeaderboard.tsx · StreakLeaderboard.tsx · overall.css · streak.css",
    "results",
  ],
  [
    "Недельная цель, календарь и постоянные достижения",
    "PlayWeek.tsx · ActivityExamples.tsx",
    "results",
  ],
  [
    "Рекомендации дня и следующий шаг после игры",
    "TodayPlay.tsx · PlayNextStep.tsx · play-progress.css",
    "cards",
  ],
  [
    "Принципы, критерии приёмки и правила применения",
    "designGuidance.ts",
    "contracts",
  ],
  ["Общие правила и закрытие модальных окон", "RulesDialog.tsx", "overlays"],
  ["Поля, связанные подсказки и локальные ошибки", "FormField.tsx", "forms"],
  [
    "Проверка, отправка, ошибка и сохранение результата",
    "ResultStatus.tsx",
    "results",
  ],
  [
    "Живые обложки и реакции значков навыков",
    "useCardMotion.ts · GamePreviews.tsx · CategoryGlyph.tsx",
    "motion",
  ],
  ["Случайная игра: перемешивание стопки", "RandomGame.tsx", "motion"],
  ["Рисованное подчёркивание и звезда дня", "HandDrawn.tsx", "motion"],
  [
    "Тактильные кнопки и неподвижная область нажатия",
    "home-delight.css · .tactile",
    "motion",
  ],
  [
    "Поздравление с новым рекордом",
    "RecordCelebration.tsx · recordCelebrationState.ts",
    "motion",
  ],
  [
    "Гостевая партия, продолжение, вход и сохранение",
    "account.tsx · GameIntro.tsx",
    "results",
  ],
  [
    "Старт игры, личный рекорд, запуск и загрузка",
    "GameIntro.tsx · game-start.css",
    "gameplay",
  ],
  [
    "Цвета обеих тем, семантика ошибок и фокуса",
    "design-tokens.css",
    "foundations",
  ],
  [
    "Шрифт, размеры, начертания, межстрочный интервал",
    "design-tokens.css · style.css",
    "type",
  ],
  [
    "Сетка, контейнеры, отступы, скругления и тени",
    "design-tokens.css",
    "layout",
  ],
  [
    "Логотип: знак и полная версия",
    "SiteHeader.tsx · PlayneMark / PlayneBrand",
    "brand",
  ],
  [
    "Вход, профиль, светлая и тёмная темы",
    "account.tsx · SiteHeader.tsx",
    "brand",
  ],
  [
    "Основная кнопка: обычная, наведение, фокус, нажатие",
    "style.css · .primary",
    "actions",
  ],
  ["Кнопки: вторичная, текстовая, опасное действие", "ui.css", "actions"],
  [
    "Загрузка и недоступная кнопка",
    "ui.css · .ui-spinner / :disabled",
    "actions",
  ],
  [
    "Ссылки: текстовая, переход, внешняя",
    "style.css · SiteHeader.tsx",
    "actions",
  ],
  [
    "Кнопки с иконками: тема, правила, закрытие, пауза",
    "SiteHeader.tsx · pressure.css",
    "actions",
  ],
  [
    "Ник: метка, подсказка, ошибка и сохранение",
    "AccountPage.tsx · community.css",
    "forms",
  ],
  [
    "Выбор режима: обычный, выбранный, недоступный",
    "ui.tsx · ModeChoice",
    "forms",
  ],
  ["Ползунки: размер и цветовой тон", "App.tsx · ColorfleGame.tsx", "forms"],
  ["Общая шапка всех игр", "SiteHeader.tsx · GameHeader", "navigation"],
  [
    "Вкладки игр, период и режим рейтинга",
    "LeaderboardPage.tsx · community.css",
    "navigation",
  ],
  ["Пагинация и выбранная страница", "LeaderboardPage.tsx", "navigation"],
  [
    "Ссылка пропуска навигации и якорные ссылки",
    "style.css · .skip-link",
    "navigation",
  ],
  ["Карточки: На глаз, Круг, Оттенок", "Hub.tsx", "cards"],
  [
    "Карточки: Где я, Достопримечательности, Жми",
    "Hub.tsx · GeoPreview.tsx · LandmarkPreview.tsx",
    "cards",
  ],
  [
    "Одной линией: карточка, поле, числа и маршрут",
    "Hub.tsx · LinePreview.tsx",
    "cards",
  ],
  [
    "Разминка для ума: четыре карточки, календарь и практика",
    "BrainHub.tsx · BrainPreview.tsx · brain-hub.css",
    "cards",
  ],
  [
    "Вспышка, Поворот, Передвинь и Диспетчер: поля, правила, ответы",
    "BrainGame.tsx · BrainBoards.tsx · brain-game.css",
    "gameplay",
  ],
  [
    "Точки раундов: пройденный, текущий, следующий",
    "ui.tsx · RoundDots",
    "gameplay",
  ],
  [
    "Раунд, счёт, таймер и предупреждение о времени",
    "colorfle.css · geo.css",
    "gameplay",
  ],
  [
    "На глаз: сцена, сетка, подписи и изменение масштаба",
    "Board.tsx · Silhouette.tsx",
    "gameplay",
  ],
  [
    "На глаз: ответ, правильный размер и легенда",
    "Board.tsx · resultLayout.ts",
    "gameplay",
  ],
  [
    "Круг: поле, центральная точка, линия и точность",
    "CircleGame.tsx · circle.css",
    "gameplay",
  ],
  [
    "Оттенок: палитра с мышью, пальцем и клавиатурой",
    "ColorfleGame.tsx · Palette",
    "gameplay",
  ],
  [
    "Оттенок: образец, ответ, HEX и пустой ответ",
    "ColorfleGame.tsx · Swatch",
    "gameplay",
  ],
  [
    "Где я: панорама, мини-карта и кнопки карты",
    "GeoGame.tsx · geo.css",
    "gameplay",
  ],
  [
    "Жми: физическая кнопка и состояния нажатия",
    "PressureGame.tsx · pressure.css",
    "gameplay",
  ],
  [
    "Жми: кольцо времени, успех, ошибка и пауза",
    "PressureGame.tsx · PressureTimer",
    "gameplay",
  ],
  [
    "Одной линией: маршрут, клетки, правила и очки",
    "LinePreview.tsx · lineContent.ts",
    "gameplay",
  ],
  [
    "Результаты: баллы, проценты, очко / очка / очков",
    "account.tsx · resultText",
    "results",
  ],
  [
    "Общий рейтинг, вклад игр и топ-5 на главной",
    "OverallLeaderboard.tsx · overall.css",
    "results",
  ],
  [
    "Пять результатов раундов и личный рекорд",
    "community.css · colorfle.css",
    "results",
  ],
  [
    "Таблица: позиция, игрок, баллы, своя строка",
    "LeaderboardPage.tsx",
    "results",
  ],
  [
    "Сохранение: гость, проверка, отправка, сохранено, повтор",
    "account.tsx · SaveResult",
    "results",
  ],
  [
    "Профиль: результаты по играм, режимам и история партий",
    "AccountBests.tsx · AccountPage.tsx",
    "results",
  ],
  [
    "Правила, подтверждение и закрытие по Escape",
    "style.css · colorfle.css · geo.css",
    "overlays",
  ],
  [
    "Загрузка, ошибка соединения, успех и предупреждение",
    "ui.tsx · StatusMessage",
    "feedback",
  ],
  [
    "Пустой рейтинг и недоступное действие",
    "community.css · .rank-empty",
    "feedback",
  ],
  [
    "Анимации и режим уменьшенного движения",
    "design-tokens.css · ui.css · pressure.css",
    "feedback",
  ],
  [
    "Текстовые страницы, правила, списки и FAQ",
    "GuidePage.tsx · PressureAbout.tsx · LineAbout.tsx",
    "content",
  ],
  [
    "Личный разбор результата",
    "BrainInsight.tsx · brain-insight.css",
    "results",
  ],
  [
    "Вызов другу и общая ссылка",
    "ShareResult.tsx · ChallengeContext.tsx · challenge.css",
    "overlays",
  ],
  ["Общий футер со всеми ссылками", "FooterLinks.tsx", "content"],
  [
    "Векторные силуэты и растровые маски",
    "Silhouette.tsx · RasterSilhouette.tsx · data.ts",
    "artwork",
  ],
  ["Исправления, проверка и границы демонстраций", "DESIGN_SYSTEM.md", "audit"],
] as const;
