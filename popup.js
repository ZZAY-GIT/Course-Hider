document.addEventListener("DOMContentLoaded", () => {
  // Состояние
  let detectedCourses = [];
  let hiddenCourses = [];
  let groups = [];
  let activeGroupId = "all";
  let currentTab = "courses";
  let searchQuery = "";
  let openEditorGroupId = null;
  const groupSearchQueries = {};

  // DOM Элементы
  const courseListEl = document.getElementById("courseList");
  const hiddenListEl = document.getElementById("hiddenList");
  const groupsListEl = document.getElementById("groupsList");
  const emptyMessageEl = document.getElementById("emptyMessage");
  const searchInput = document.getElementById("searchInput");
  const activeFilterSelect = document.getElementById("activeFilterSelect");
  const activeModeBadge = document.getElementById("activeModeBadge");

  const viewCourses = document.getElementById("viewCourses");
  const viewGroups = document.getElementById("viewGroups");
  const viewHidden = document.getElementById("viewHidden");

  const tabCoursesBtn = document.getElementById("tabCourses");
  const tabGroupsBtn = document.getElementById("tabGroups");
  const tabHiddenBtn = document.getElementById("tabHidden");

  const countCoursesEl = document.getElementById("countCourses");
  const countGroupsEl = document.getElementById("countGroups");
  const countHiddenEl = document.getElementById("countHidden");
  const statusInfo = document.getElementById("statusInfo");
  const restoreAllBtn = document.getElementById("restoreAll");

  const newGroupNameInput = document.getElementById("newGroupNameInput");
  const addGroupBtn = document.getElementById("addGroupBtn");

  // Вспомогательные функции
  const isCourseHidden = (courseId) => {
    return hiddenCourses.some((c) => (typeof c === "object" ? String(c.id) : String(c)) === String(courseId));
  };

  const getGroupsForCourse = (courseId) => {
    const strId = String(courseId);
    return groups.filter((g) => (g.courseIds || []).map(String).includes(strId));
  };

  // Все уникальные курсы (обнаруженные + скрытые)
  const getAllKnownCourses = () => {
    const map = new Map();
    detectedCourses.forEach((c) => {
      if (c && c.id) map.set(String(c.id), { id: String(c.id), name: c.name || `Курс #${c.id}` });
    });
    hiddenCourses.forEach((c) => {
      const id = String(typeof c === "object" ? c.id : c);
      if (id && !map.has(id)) {
        map.set(id, { id, name: typeof c === "object" && c.name ? c.name : `Курс #${id}` });
      }
    });
    return Array.from(map.values());
  };

  // Сохранение состояния в chrome.storage
  const saveState = (callback) => {
    chrome.storage.local.set(
      {
        hiddenCourses,
        groups,
        activeGroupId
      },
      () => {
        if (callback) callback();
      }
    );
  };

  // Обновление выпадающего списка выбора группы "Отображать"
  const updateDropdown = () => {
    const allCount = getAllKnownCourses().length;
    let html = `<option value="all" ${activeGroupId === "all" ? "selected" : ""}>Все курсы (${allCount})</option>`;

    groups.forEach((g) => {
      const count = (g.courseIds || []).length;
      html += `<option value="${g.id}" ${activeGroupId === g.id ? "selected" : ""}>📁 ${g.name} (${count})</option>`;
    });

    activeFilterSelect.innerHTML = html;

    // Бейдж в шапке
    if (activeGroupId === "all") {
      activeModeBadge.textContent = "Все курсы";
      activeModeBadge.style.color = "#89b4fa";
    } else {
      const current = groups.find((g) => g.id === activeGroupId);
      activeModeBadge.textContent = `📁 ${current ? current.name : "Группа"}`;
      activeModeBadge.style.color = "#a6e3a1";
    }
  };

  // Обновление счетчиков
  const updateCounts = () => {
    const all = getAllKnownCourses();
    countCoursesEl.textContent = all.length;
    countGroupsEl.textContent = groups.length;
    countHiddenEl.textContent = hiddenCourses.length;

    let visibleCount = all.length;
    if (activeGroupId !== "all") {
      const g = groups.find((grp) => grp.id === activeGroupId);
      visibleCount = g ? (g.courseIds || []).length : 0;
    } else {
      visibleCount = Math.max(0, all.length - hiddenCourses.length);
    }
    statusInfo.textContent = `Показано: ${visibleCount} из ${all.length} | Скрыто: ${hiddenCourses.length}`;
  };

  // Переключение включения курса в активную группу
  const toggleCourseInActiveGroup = (courseId, isIncluded) => {
    const g = groups.find((grp) => grp.id === activeGroupId);
    if (!g) return;
    if (!g.courseIds) g.courseIds = [];

    const strId = String(courseId);
    if (isIncluded) {
      if (!g.courseIds.map(String).includes(strId)) {
        g.courseIds.push(strId);
      }
    } else {
      g.courseIds = g.courseIds.map(String).filter((id) => id !== strId);
    }

    saveState(() => render());
  };

  // Переключение индивидуальной видимости курса (в режиме "Все курсы")
  const toggleCourseVisibility = (course, isVisible) => {
    const id = String(course.id);
    let updatedHidden = [...hiddenCourses];

    if (isVisible) {
      updatedHidden = updatedHidden.filter((c) => (typeof c === "object" ? String(c.id) : String(c)) !== id);
    } else {
      if (!updatedHidden.some((c) => (typeof c === "object" ? String(c.id) : String(c)) === id)) {
        updatedHidden.push({ id, name: course.name });
      }
    }

    hiddenCourses = updatedHidden;
    saveState(() => render());
  };

  // Рендер вкладки "Курсы"
  const renderCoursesTab = () => {
    courseListEl.innerHTML = "";
    const allCourses = getAllKnownCourses();
    let displayList = allCourses;

    // Поиск
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      displayList = displayList.filter((c) => c.name.toLowerCase().includes(q) || c.id.includes(q));
    }

    if (displayList.length === 0) {
      emptyMessageEl.style.display = "block";
      emptyMessageEl.textContent = searchQuery.trim()
        ? "Ничего не найдено по вашему запросу."
        : "Курсы пока не загружены. Откройте страницу online.mospolytech.ru/my/courses.php";
      return;
    }

    emptyMessageEl.style.display = "none";

    displayList.forEach((course) => {
      const li = document.createElement("li");
      li.className = "course-item";

      const infoDiv = document.createElement("div");
      infoDiv.className = "course-info";

      const nameEl = document.createElement("div");
      nameEl.className = "course-name";
      nameEl.textContent = course.name;
      nameEl.title = course.name;

      const metaDiv = document.createElement("div");
      metaDiv.className = "course-meta";

      const idEl = document.createElement("span");
      idEl.className = "course-id";
      idEl.textContent = `ID: ${course.id}`;
      metaDiv.appendChild(idEl);

      // Бейджи групп, к которым привязан курс
      const courseGroups = getGroupsForCourse(course.id);
      courseGroups.forEach((g) => {
        const badge = document.createElement("span");
        badge.className = "badge-col";
        badge.textContent = g.name;
        metaDiv.appendChild(badge);
      });

      infoDiv.appendChild(nameEl);
      infoDiv.appendChild(metaDiv);

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "course-actions";

      // Кнопка быстрого добавления в группу
      if (groups.length > 0) {
        const assignBtn = document.createElement("button");
        assignBtn.className = "btn-assign-col";
        assignBtn.innerHTML = "📁 +";
        assignBtn.title = "Добавить или убрать из групп";
        assignBtn.addEventListener("click", () => {
          showQuickAssignMenu(course);
        });
        actionsDiv.appendChild(assignBtn);
      }

      // Тумблер:
      // В режиме группы = включен ли курс в текущую группу
      // В режиме "Все курсы" = отображается ли курс на странице
      const label = document.createElement("label");
      label.className = "toggle-switch";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";

      if (activeGroupId !== "all") {
        const activeGrp = groups.find((g) => g.id === activeGroupId);
        const inActiveGrp = activeGrp && (activeGrp.courseIds || []).map(String).includes(String(course.id));
        checkbox.checked = inActiveGrp;
        label.title = inActiveGrp ? "Убрать из текущей группы" : "Добавить в текущую группу";

        checkbox.addEventListener("change", () => {
          toggleCourseInActiveGroup(course.id, checkbox.checked);
        });
      } else {
        const isHidden = isCourseHidden(course.id);
        checkbox.checked = !isHidden;
        label.title = isHidden ? "Показать курс" : "Скрыть курс";

        checkbox.addEventListener("change", () => {
          toggleCourseVisibility(course, checkbox.checked);
        });
      }

      const slider = document.createElement("span");
      slider.className = "slider";

      label.appendChild(checkbox);
      label.appendChild(slider);
      actionsDiv.appendChild(label);

      li.appendChild(infoDiv);
      li.appendChild(actionsDiv);
      courseListEl.appendChild(li);
    });
  };

  // Быстрое меню назначения групп курсу
  const showQuickAssignMenu = (course) => {
    if (groups.length === 0) return;
    const strId = String(course.id);

    let message = `Выберите группы для курса «${course.name}»:\n\n`;
    groups.forEach((g, idx) => {
      const has = (g.courseIds || []).map(String).includes(strId);
      message += `${idx + 1}. [${has ? "✓ В группе" : "  Не в группе"}] ${g.name}\n`;
    });
    message += `\nВведите номер группы для переключения (1-${groups.length}):`;

    const choice = prompt(message);
    if (!choice) return;

    const num = parseInt(choice.trim(), 10);
    if (num >= 1 && num <= groups.length) {
      const g = groups[num - 1];
      if (!g.courseIds) g.courseIds = [];
      const has = g.courseIds.map(String).includes(strId);

      if (has) {
        g.courseIds = g.courseIds.map(String).filter((id) => id !== strId);
      } else {
        g.courseIds.push(strId);
      }

      saveState(() => render());
    }
  };

  // Рендер вкладки "Группы"
  const renderGroupsTab = () => {
    groupsListEl.innerHTML = "";

    if (groups.length === 0) {
      emptyMessageEl.style.display = "block";
      emptyMessageEl.innerHTML = "Групп пока нет.<br>Создайте например «1 курс», «2 курс» или «Важные».";
      return;
    }

    emptyMessageEl.style.display = "none";
    const allCourses = getAllKnownCourses();

    groups.forEach((g) => {
      const card = document.createElement("div");
      card.className = "group-card";

      const header = document.createElement("div");
      header.className = "group-card-header";

      const title = document.createElement("div");
      title.className = "group-card-title";
      title.innerHTML = `📁 ${g.name} <span class="group-count-tag">(${(g.courseIds || []).length} курсов)</span>`;

      const actions = document.createElement("div");
      actions.className = "group-card-actions";

      // Кнопка настройки состава
      const editBtn = document.createElement("button");
      editBtn.className = "group-btn";
      const isEditorOpen = openEditorGroupId === g.id;
      editBtn.textContent = isEditorOpen ? "Свернуть" : "Выбрать курсы";
      editBtn.addEventListener("click", () => {
        openEditorGroupId = isEditorOpen ? null : g.id;
        renderGroupsTab();
      });

      // Кнопка удаления группы
      const delBtn = document.createElement("button");
      delBtn.className = "group-btn group-btn-del";
      delBtn.innerHTML = "✕";
      delBtn.title = "Удалить группу";
      delBtn.addEventListener("click", () => {
        if (confirm(`Удалить группу «${g.name}»? (Курсы не удалятся)`)) {
          groups = groups.filter((item) => item.id !== g.id);
          if (activeGroupId === g.id) activeGroupId = "all";
          saveState(() => render());
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      header.appendChild(title);
      header.appendChild(actions);
      card.appendChild(header);

      // Раскрывающийся редактор курсов с поиском
      if (isEditorOpen) {
        const editorBox = document.createElement("div");
        editorBox.className = "group-editor-box open";

        // Поле поиска по названию курса внутри группы
        const searchBar = document.createElement("div");
        searchBar.className = "group-search-bar";

        const searchInGroup = document.createElement("input");
        searchInGroup.type = "text";
        searchInGroup.placeholder = "🔍 Поиск по названию курса для добавления...";
        searchInGroup.value = groupSearchQueries[g.id] || "";

        searchBar.appendChild(searchInGroup);
        editorBox.appendChild(searchBar);

        const editorList = document.createElement("div");
        editorList.className = "group-editor-list";

        const renderEditorCourseItems = () => {
          editorList.innerHTML = "";
          const query = (groupSearchQueries[g.id] || "").toLowerCase().trim();

          let filteredCourses = allCourses;
          if (query) {
            filteredCourses = allCourses.filter((c) => c.name.toLowerCase().includes(query) || c.id.includes(query));
          }

          if (filteredCourses.length === 0) {
            editorList.innerHTML = "<div style='padding:6px; color:#6c7086; font-size:11px;'>Курсы не найдены.</div>";
            return;
          }

          filteredCourses.forEach((c) => {
            const label = document.createElement("label");
            label.className = "group-course-check";

            const chk = document.createElement("input");
            chk.type = "checkbox";
            chk.checked = (g.courseIds || []).map(String).includes(String(c.id));

            chk.addEventListener("change", () => {
              if (!g.courseIds) g.courseIds = [];
              const strId = String(c.id);
              if (chk.checked) {
                if (!g.courseIds.map(String).includes(strId)) g.courseIds.push(strId);
              } else {
                g.courseIds = g.courseIds.map(String).filter((id) => id !== strId);
              }
              saveState(() => {
                updateDropdown();
                updateCounts();
                title.innerHTML = `📁 ${g.name} <span class="group-count-tag">(${(g.courseIds || []).length} курсов)</span>`;
              });
            });

            const span = document.createElement("span");
            span.textContent = c.name;
            span.title = `ID: ${c.id}`;

            label.appendChild(chk);
            label.appendChild(span);
            editorList.appendChild(label);
          });
        };

        searchInGroup.addEventListener("input", (e) => {
          groupSearchQueries[g.id] = e.target.value;
          renderEditorCourseItems();
        });

        renderEditorCourseItems();
        editorBox.appendChild(editorList);
        card.appendChild(editorBox);
      }

      groupsListEl.appendChild(card);
    });
  };

  // Рендер вкладки "Скрытые"
  const renderHiddenTab = () => {
    hiddenListEl.innerHTML = "";

    if (hiddenCourses.length === 0) {
      emptyMessageEl.style.display = "block";
      emptyMessageEl.textContent = "У вас нет скрытых вручную курсов.";
      return;
    }

    emptyMessageEl.style.display = "none";

    hiddenCourses.forEach((course) => {
      const li = document.createElement("li");
      li.className = "course-item";

      const infoDiv = document.createElement("div");
      infoDiv.className = "course-info";

      const nameEl = document.createElement("div");
      nameEl.className = "course-name";
      nameEl.textContent = course.name || `Курс #${course.id}`;

      const idEl = document.createElement("div");
      idEl.className = "course-id";
      idEl.textContent = `ID: ${course.id}`;

      infoDiv.appendChild(nameEl);
      infoDiv.appendChild(idEl);

      const restoreBtn = document.createElement("button");
      restoreBtn.className = "group-btn";
      restoreBtn.textContent = "Восстановить";
      restoreBtn.addEventListener("click", () => {
        hiddenCourses = hiddenCourses.filter((c) => (typeof c === "object" ? String(c.id) : String(c)) !== String(course.id));
        saveState(() => render());
      });

      li.appendChild(infoDiv);
      li.appendChild(restoreBtn);
      hiddenListEl.appendChild(li);
    });
  };

  // Главная функция перерисовки
  const render = () => {
    updateDropdown();
    updateCounts();

    viewCourses.style.display = currentTab === "courses" ? "block" : "none";
    viewGroups.style.display = currentTab === "groups" ? "block" : "none";
    viewHidden.style.display = currentTab === "hidden" ? "block" : "none";

    if (currentTab === "courses") renderCoursesTab();
    else if (currentTab === "groups") renderGroupsTab();
    else if (currentTab === "hidden") renderHiddenTab();
  };

  // Загрузка данных из Storage
  const loadData = () => {
    chrome.storage.local.get(
      ["hiddenCourses", "detectedCourses", "groups", "collections", "activeGroupId", "activeCollectionId"],
      (data) => {
        hiddenCourses = data.hiddenCourses || [];
        detectedCourses = data.detectedCourses || [];
        groups = data.groups || data.collections || [];
        activeGroupId = data.activeGroupId || data.activeCollectionId || "all";

        render();

        // Опрос активной вкладки
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getDetectedCourses" }, (res) => {
              if (chrome.runtime.lastError) return;
              if (res) {
                if (res.detected) detectedCourses = res.detected;
                if (res.hidden) hiddenCourses = res.hidden;
                if (res.groups) groups = res.groups;
                if (res.activeGroupId) activeGroupId = res.activeGroupId;
                render();
              }
            });
          }
        });
      }
    );
  };

  // Переключение вкладок
  tabCoursesBtn.addEventListener("click", () => {
    currentTab = "courses";
    tabCoursesBtn.classList.add("active");
    tabGroupsBtn.classList.remove("active");
    tabHiddenBtn.classList.remove("active");
    render();
  });

  tabGroupsBtn.addEventListener("click", () => {
    currentTab = "groups";
    tabGroupsBtn.classList.add("active");
    tabCoursesBtn.classList.remove("active");
    tabHiddenBtn.classList.remove("active");
    render();
  });

  tabHiddenBtn.addEventListener("click", () => {
    currentTab = "hidden";
    tabHiddenBtn.classList.add("active");
    tabCoursesBtn.classList.remove("active");
    tabGroupsBtn.classList.remove("active");
    render();
  });

  // Выбор группы в выпадающем списке в шапке
  activeFilterSelect.addEventListener("change", (e) => {
    activeGroupId = e.target.value;
    saveState(() => render());
  });

  // Создание новой группы
  const createGroup = () => {
    const name = newGroupNameInput.value.trim();
    if (!name) return;

    const newGrp = {
      id: "grp_" + Date.now(),
      name: name,
      courseIds: []
    };

    groups.push(newGrp);
    newGroupNameInput.value = "";
    openEditorGroupId = newGrp.id; // сразу открываем выбор курсов с поиском
    saveState(() => render());
  };

  addGroupBtn.addEventListener("click", createGroup);
  newGroupNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createGroup();
  });

  // Поиск курсов во вкладке "Курсы"
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    if (currentTab === "courses") renderCoursesTab();
  });

  // Сброс скрытых
  restoreAllBtn.addEventListener("click", () => {
    hiddenCourses = [];
    saveState(() => render());
  });

  // Запуск
  loadData();
});