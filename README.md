<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Course Hider Logo">
</p>

<h1 align="center">Course Hider — Мосполитех</h1>

<p align="center">
  <strong>Удобное расширение для организации, группировки и скрытия курсов в СДО Московского Политеха.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Version-1.0.0-emerald?style=flat-square" alt="Version 1.0.0">
  <img src="https://img.shields.io/badge/License-MIT-purple?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/Browsers-Chrome%20%7C%20Opera%20%7C%20Edge%20%7C%20Yandex-orange?style=flat-square" alt="Browsers">
</p>

---

## 🎯 Описание

В личном кабинете СДО Мосполитеха (`online.mospolytech.ru` и `lms.mospolytech.ru`) со временем скапливаются десятки дисциплин за прошлые семестры и учебные годы.

**Course Hider** позволяет навести порядок:
- Создавать свои группы курсов (например, «1 курс», «2 курс», «Текущий семестр», «Важные»).
- Быстро переключаться между группами через выпадающий список — на странице остаются только нужные дисциплины.
- Скрывать ненужные курсы в один клик.
- Страница университета остаётся чистой: никаких посторонних кнопок или плашек в верстке сайта.
- Все настройки хранятся локально в вашем браузере (`chrome.storage.local`).

---

## ✨ Основные возможности

- 📁 **Группы курсов**: объединяйте предметы по годам обучения, семестрам или важности.
- 🔍 **Умный поиск**: поиск курсов по названию как в общем списке, так и внутри редактора группы для быстрого добавления.
- ⚡ **Мгновенная фильтрация**: использует динамические CSS-правила, поэтому скрытые предметы не мелькают при обновлении страницы.
- 🎨 **Современный интерфейс**: темная тема в стиле Catppuccin / Linear с векторными SVG-иконками и плавными переключателями.
- 🛡️ **100% приватность**: расширение не собирает и никуда не передает данные. Работает автономно.

---

## 🚀 Установка (Режим разработчика)

1. Клонируйте репозиторий или скачайте исходный код:
   ```bash
   git clone https://github.com/ZZAY-GIT/Course-Hider.git
   ```
2. Откройте в браузере страницу расширений:
   - **Google Chrome**: `chrome://extensions/`
   - **Opera**: `opera://extensions/`
   - **Яндекс.Браузер**: `browser://extensions/`
   - **Microsoft Edge**: `edge://extensions/`
3. Включите **«Режим разработчика»** (Developer mode) в правом верхнем углу.
4. Нажмите **«Загрузить распакованное расширение»** (Load unpacked) и выберите папку проекта.
5. Откройте [Мои курсы Мосполитеха](https://online.mospolytech.ru/my/courses.php) и управляйте отображением через иконку расширения!

---

## 📦 Сборка дистрибутива (Zip-архив)

В проекте есть готовый скрипт для сборки чистого zip-архива без лишних файлов разработки:

```bash
python package.py
```

После выполнения команды в папке `release/` появится готовый архив:
```
release/course-hider-v1.0.0.zip
```

---

## 📁 Структура проекта

```text
course-hider-extension/
├── icons/
│   ├── icon16.png        # Favicon и контекстное меню
│   ├── icon32.png        # Windows HiDPI экраны
│   ├── icon48.png        # Страница chrome://extensions
│   ├── icon128.png       # Магазины расширений
│   └── icon512.png       # Мастер-логотип высокого разрешения
├── content.js            # Content script (тегирование и CSS-сокрытие)
├── popup.html            # Разметка интерфейса расширения
├── popup.js              # Управление группами, поиском и видимостью
├── manifest.json         # Конфигурация Manifest V3
├── package.py            # Скрипт сборки release zip
├── PRIVACY.md            # Политика конфиденциальности
├── LICENSE               # Лицензия MIT
└── README.md             # Документация проекта
```

---

## 📄 Лицензия

Распространяется под лицензией [MIT](LICENSE).
