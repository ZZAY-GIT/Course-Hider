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