(() => {
  console.log("[Course Hider] Запуск content script (чистый режим без кнопок на странице)...");

  // Состояние в памяти
  const detectedCoursesMap = new Map();
  let hiddenCoursesCache = [];
  let groupsCache = [];
  let activeGroupId = "all";
  let saveDetectedTimeout = null;

  // Извлечение ID курса из URL
  const extractCourseId = (url) => {
    if (!url) return null;
    const match = url.match(/[?&]id=(\d+)/);
    return match ? String(match[1]) : null;
  };

  // Базовые стили для фильтрации
  const injectBaseStyles = () => {
    if (document.getElementById("ch-base-styles")) return;
    const style = document.createElement("style");
    style.id = "ch-base-styles";
    style.textContent = `
      /* Скрытие курсов, не входящих в выбранную группу */
      body.ch-filter-active [data-course-id]:not([data-ch-allowed="true"]),
      body.ch-filter-active [data-courseid]:not([data-ch-allowed="true"]),
      body.ch-filter-active [data-ch-id]:not([data-ch-allowed="true"]) {
        display: none !important;
      }

      /* Панель быстрого переключения групп на странице курсов (в стиле Moodle) */
      #ch-group-switcher {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 0 10px 0;
        margin: 4px 0 12px 0;
        background: transparent;
        border: none;
        border-bottom: 1px solid #dee2e6;
        box-shadow: none;
        box-sizing: border-box;
        font-family: inherit;
        flex-wrap: wrap;
      }
      #ch-group-switcher.collapsed {
        padding: 4px 0;
      }
      #ch-group-switcher.collapsed .ch-switcher-chips,
      #ch-group-switcher.collapsed .ch-meta-count {
        display: none !important;
      }
      .ch-switcher-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        flex: 1;
        min-width: 0;
      }
      .ch-switcher-label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        font-weight: 600;
        color: #495057;
        user-select: none;
        flex-shrink: 0;
      }
      .ch-switcher-chips {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .ch-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
        color: #0f6cbf;
        background: #ffffff;
        border: 1px solid #ced4da;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
        line-height: 1.4;
        outline: none;
        font-family: inherit;
      }
      .ch-chip:hover {
        background: #f8f9fa;
        color: #0c5699;
        border-color: #adb5bd;
      }
      .ch-chip.active {
        background: #0f6cbf;
        color: #ffffff;
        border-color: #0f6cbf;
        font-weight: 500;
      }
      .ch-chip .ch-count {
        font-size: 11px;
        padding: 0 5px;
        border-radius: 10px;
        background: #e9ecef;
        color: #495057;
        line-height: 1.3;
      }
      .ch-chip.active .ch-count {
        background: rgba(255, 255, 255, 0.25);
        color: #ffffff;
      }
      .ch-hint {
        font-size: 12px;
        color: #6c757d;
        font-style: italic;
      }
      .ch-switcher-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
        font-size: 12px;
        color: #6c757d;
      }
      .ch-meta-count {
        font-size: 12px;
        color: #6c757d;
      }
      .ch-collapse-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        color: #6c757d;
        font-size: 12px;
        text-decoration: underline;
        font-family: inherit;
        transition: color 0.15s;
      }
      .ch-collapse-btn:hover {
        color: #0f6cbf;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  // Обновление CSS-правил скрытия
  const updateDynamicHiddenStyles = () => {
    let style = document.getElementById("ch-dynamic-hidden-styles");
    if (!style) {
      style = document.createElement("style");
      style.id = "ch-dynamic-hidden-styles";
      (document.head || document.documentElement).appendChild(style);
    }

    // Если выбрана конкретная группа курсов
    if (activeGroupId && activeGroupId !== "all") {
      document.body.classList.add("ch-filter-active");
      const currentGroup = groupsCache.find((g) => g.id === activeGroupId);
      const allowedSet = new Set((currentGroup?.courseIds || []).map(String));

      document.querySelectorAll("[data-ch-id], [data-course-id], [data-courseid]").forEach((el) => {
        const id = String(el.getAttribute("data-ch-id") || el.getAttribute("data-course-id") || el.getAttribute("data-courseid"));
        if (allowedSet.has(id)) {
          el.setAttribute("data-ch-allowed", "true");
        } else {
          el.removeAttribute("data-ch-allowed");
        }
      });

      style.textContent = "";
      return;
    }

    // Если режим "Все курсы" (скрываем только индивидуально отключенные)
    document.body.classList.remove("ch-filter-active");
    if (!hiddenCoursesCache || hiddenCoursesCache.length === 0) {
      style.textContent = "";
      return;
    }

    const selectors = [];
    hiddenCoursesCache.forEach((c) => {
      const id = typeof c === "object" ? String(c.id) : String(c);
      if (id) {
        selectors.push(`[data-course-id="${id}"]`);
        selectors.push(`[data-courseid="${id}"]`);
        selectors.push(`[data-ch-id="${id}"]`);
      }
    });

    if (selectors.length > 0) {
      style.textContent = `${selectors.join(",\n")} { display: none !important; }`;
    } else {
      style.textContent = "";
    }
  };

  // Очистка названия курса
  const cleanCourseTitle = (rawText) => {
    if (!rawText) return "Без названия";
    return rawText
      .replace(/\s+/g, " ")
      .replace(/✕\s*Скрыть/g, "")
      .replace(/Скрыть/g, "")
      .replace(/Действия для курса/g, "")
      .replace(/Course is starred/g, "")
      .trim();
  };

  // Сохранение найденных курсов в storage
  const saveDetectedCoursesDebounced = () => {
    if (saveDetectedTimeout) clearTimeout(saveDetectedTimeout);
    saveDetectedTimeout = setTimeout(() => {
      const list = Array.from(detectedCoursesMap.values());
      chrome.storage.local.set({ detectedCourses: list });
    }, 400);
  };

  // Обработка найденного элемента курса (только тегирование, БЕЗ добавления кнопок на страницу)
  const processCourseElement = (container, courseId, fallbackName) => {
    if (!courseId) return;
    const strId = String(courseId);

    container.setAttribute("data-ch-id", strId);

    if (activeGroupId && activeGroupId !== "all") {
      const grp = groupsCache.find((g) => g.id === activeGroupId);
      if (grp && (grp.courseIds || []).map(String).includes(strId)) {
        container.setAttribute("data-ch-allowed", "true");
      } else {
        container.removeAttribute("data-ch-allowed");
      }
    }

    let titleEl = container.querySelector(
      ".coursename, .course-name, .coursename a, a.coursename, .card-title, h4, h5, h6, .coursefullname a, a[href*='/course/view.php?id=']"
    );
    let courseName = titleEl ? cleanCourseTitle(titleEl.textContent) : fallbackName || `Курс #${strId}`;
    if (!courseName && fallbackName) courseName = fallbackName;

    if (!detectedCoursesMap.has(strId) || (courseName && detectedCoursesMap.get(strId).name.startsWith("Курс #"))) {
      detectedCoursesMap.set(strId, {
        id: strId,
        name: courseName,
        url: `https://online.mospolytech.ru/course/view.php?id=${strId}`
      });
      saveDetectedCoursesDebounced();
    }
  };

  // Сканирование страницы на наличие курсов
  const scanPageForCourses = () => {
    const elementsWithDataId = document.querySelectorAll("[data-course-id], [data-courseid]");
    elementsWithDataId.forEach((el) => {
      const id = el.getAttribute("data-course-id") || el.getAttribute("data-courseid");
      if (id && id !== "0") {
        processCourseElement(el, id);
      }
    });

    const courseLinks = document.querySelectorAll("a[href*='/course/view.php?id=']");
    courseLinks.forEach((link) => {
      const id = extractCourseId(link.href);
      if (!id) return;

      const container = link.closest(
        "[data-course-id], [data-courseid], .dashboard-card, .coursebox, .card, [data-region='course-content'], li.list-group-item, tr"
      );

      if (container) {
        processCourseElement(container, id, cleanCourseTitle(link.textContent));
      } else if (link.parentElement) {
        processCourseElement(link.parentElement, id, cleanCourseTitle(link.textContent));
      }
    });

    renderPageGroupBar();
  };

  // Экранирование HTML
  const escapeHtml = (str) => {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Проверка: находимся ли мы на странице со списком курсов
  const isCoursesListPage = () => {
    return (
      window.location.pathname.includes("/my") ||
      document.querySelector('[data-region="courses-view"], [data-region="course-view"], .block-myoverview') !== null ||
      detectedCoursesMap.size > 0
    );
  };

  // Выбор группы курсов прямо на странице
  const selectGroup = (groupId) => {
    // Повторный клик по активной группе сбрасывает фильтр на "all"
    const targetGroup = (activeGroupId === groupId && groupId !== "all") ? "all" : groupId;
    activeGroupId = targetGroup;
    chrome.storage.local.set({ activeGroupId: targetGroup }, () => {
      updateDynamicHiddenStyles();
      updatePageGroupBar();
    });
  };

  // Обновление состояния панели групп на странице
  const updatePageGroupBar = () => {
    const bar = document.getElementById("ch-group-switcher");
    if (!bar) {
      renderPageGroupBar();
      return;
    }

    const totalCourses = detectedCoursesMap.size;
    let visibleCount = totalCourses;
    if (activeGroupId && activeGroupId !== "all") {
      const cur = groupsCache.find((g) => g.id === activeGroupId);
      visibleCount = cur ? (cur.courseIds || []).length : 0;
    } else {
      visibleCount = Math.max(0, totalCourses - hiddenCoursesCache.length);
    }

    // Обновляем счетчик
    const metaCountEl = bar.querySelector(".ch-meta-count");
    if (metaCountEl) {
      metaCountEl.textContent = `Показано: ${visibleCount} из ${totalCourses}`;
    }

    // Обновляем кнопки групп
    const chipsContainer = bar.querySelector(".ch-switcher-chips");
    if (chipsContainer) {
      chipsContainer.innerHTML = "";

      // Кнопка "Все курсы"
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = `ch-chip ${activeGroupId === "all" ? "active" : ""}`;
      allBtn.title = "Показать все курсы";
      allBtn.innerHTML = `<span>Все курсы</span><span class="ch-count">${totalCourses}</span>`;
      allBtn.addEventListener("click", () => selectGroup("all"));
      chipsContainer.appendChild(allBtn);

      // Кнопки для каждой группы
      groupsCache.forEach((g) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `ch-chip ${activeGroupId === g.id ? "active" : ""}`;
        const count = (g.courseIds || []).length;
        btn.title = `Фильтровать по группе «${g.name}» (повторный клик сбросит фильтр)`;
        btn.innerHTML = `<span>📁 ${escapeHtml(g.name)}</span><span class="ch-count">${count}</span>`;
        btn.addEventListener("click", () => selectGroup(g.id));
        chipsContainer.appendChild(btn);
      });

      if (groupsCache.length === 0) {
        const hint = document.createElement("span");
        hint.className = "ch-hint";
        hint.textContent = "💡 Создайте группы в расширении для быстрой фильтрации";
        chipsContainer.appendChild(hint);
      }
    }
  };

  // Отрисовка панели групп на странице над списком курсов
  const renderPageGroupBar = () => {
    if (!isCoursesListPage()) return;

    let bar = document.getElementById("ch-group-switcher");
    if (bar) {
      updatePageGroupBar();
      return;
    }

    // Ищем лучшее место вставки прямо над списком курсов
    let targetContainer = null;
    let referenceElement = null;

    const overview = document.querySelector(
      '[data-region="courses-view"], [data-region="course-view"], .block-myoverview'
    );
    const firstCourse = document.querySelector("[data-ch-id], [data-course-id], [data-courseid]");
    const regionMain = document.querySelector("#region-main .region-main-content, #region-main, #page-content");

    if (overview) {
      targetContainer = overview.parentElement || overview;
      referenceElement = overview;
    } else if (firstCourse && firstCourse.parentElement) {
      let cand = firstCourse.parentElement;
      if (cand.parentElement && (cand.classList.contains("card-deck") || cand.classList.contains("row") || cand.id === "region-main")) {
        targetContainer = cand.parentElement;
        referenceElement = cand;
      } else {
        targetContainer = cand;
        referenceElement = firstCourse;
      }
    } else if (regionMain) {
      targetContainer = regionMain;
      referenceElement = regionMain.firstChild;
    } else if (document.body) {
      targetContainer = document.body;
      referenceElement = document.body.firstChild;
    }

    if (!targetContainer) return;

    bar = document.createElement("div");
    bar.id = "ch-group-switcher";
    bar.className = "ch-switcher-bar";

    const isCollapsed = localStorage.getItem("ch_switcher_collapsed") === "true";
    if (isCollapsed) {
      bar.classList.add("collapsed");
    }

    bar.innerHTML = `
      <div class="ch-switcher-left">
        <div class="ch-switcher-label">
          <span>📁 Группы:</span>
        </div>
        <div class="ch-switcher-chips"></div>
      </div>
      <div class="ch-switcher-right">
        <span class="ch-meta-count"></span>
        <button type="button" class="ch-collapse-btn" title="Скрыть/показать список групп">${isCollapsed ? "Развернуть" : "Свернуть"}</button>
      </div>
    `;

    const collapseBtn = bar.querySelector(".ch-collapse-btn");
    collapseBtn.addEventListener("click", () => {
      bar.classList.toggle("collapsed");
      const collapsed = bar.classList.contains("collapsed");
      localStorage.setItem("ch_switcher_collapsed", collapsed ? "true" : "false");
      collapseBtn.textContent = collapsed ? "Развернуть" : "Свернуть";
    });

    try {
      if (referenceElement && referenceElement.parentElement === targetContainer) {
        targetContainer.insertBefore(bar, referenceElement);
      } else {
        targetContainer.appendChild(bar);
      }
    } catch (e) {
      document.body.appendChild(bar);
    }

    updatePageGroupBar();
  };

  // Инициализация
  const init = () => {
    injectBaseStyles();

    // Загрузка начального состояния
    chrome.storage.local.get(
      ["hiddenCourses", "groups", "collections", "activeGroupId", "activeCollectionId"],
      (data) => {
        hiddenCoursesCache = data.hiddenCourses || [];
        groupsCache = data.groups || data.collections || [];
        activeGroupId = data.activeGroupId || data.activeCollectionId || "all";

        updateDynamicHiddenStyles();
        scanPageForCourses();
        renderPageGroupBar();
      }
    );

    // Слушатель изменений storage
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        let needUpdate = false;

        if (changes.hiddenCourses) {
          hiddenCoursesCache = changes.hiddenCourses.newValue || [];
          needUpdate = true;
        }
        if (changes.groups || changes.collections) {
          groupsCache = changes.groups ? changes.groups.newValue : changes.collections.newValue || [];
          needUpdate = true;
        }
        if (changes.activeGroupId || changes.activeCollectionId) {
          activeGroupId = changes.activeGroupId ? changes.activeGroupId.newValue : changes.activeCollectionId.newValue || "all";
          needUpdate = true;
        }

        if (needUpdate) {
          updateDynamicHiddenStyles();
          updatePageGroupBar();
        }
      }
    });

    // Слушатель сообщений из popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "getDetectedCourses") {
        scanPageForCourses();
        sendResponse({
          detected: Array.from(detectedCoursesMap.values()),
          hidden: hiddenCoursesCache,
          groups: groupsCache,
          activeGroupId: activeGroupId
        });
      }
      return true;
    });

    // Наблюдатель за изменениями DOM при AJAX подгрузке
    let mutationDebounce = null;
    const observer = new MutationObserver(() => {
      if (mutationDebounce) clearTimeout(mutationDebounce);
      mutationDebounce = setTimeout(() => {
        scanPageForCourses();
      }, 200);
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Периодическая проверка
    setInterval(scanPageForCourses, 2500);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();