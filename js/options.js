"use strict";

import {
  appActions,
  elements,
  MZ_TEXT_PREVIEW_GLOBAL_STORAGE_KEY,
  MZ_TEXT_PREVIEW_LEGACY_STORAGE_KEY,
  state,
  THEME_STORAGE_KEY
} from "./state.js";

const LIGHT_THEME = "light";
const DARK_THEME = "dark";
const MZ_DISPLAY_WINDOW = "window";

export function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(savedTheme === DARK_THEME ? DARK_THEME : LIGHT_THEME);
}

export function initializeMzDisplayMode() {
  applyMzDisplayMode(MZ_DISPLAY_WINDOW);
  loadMzTextPreviewSettings();
}

export function toggleTheme() {
  const nextTheme = state.theme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
}

export function renderThemeButton() {
  if (!elements.themeToggleButton) return;

  elements.themeToggleButton.textContent = state.theme === DARK_THEME
    ? "ライトテーマに切替"
    : "ダークテーマに切替";
}

export function toggleGlobalMzTextPreview() {
  state.mzTextPreviewEnabled = !state.mzTextPreviewEnabled;
  saveMzTextPreviewSetting();
  appActions.renderAll();
}

export function renderMzTextPreviewButton() {
  if (!elements.mzTextPreviewToggleButton) return;

  elements.mzTextPreviewToggleButton.disabled = false;
  elements.mzTextPreviewToggleButton.textContent =
    `通常ブロックをMZ表示（全メモ）: ${state.mzTextPreviewEnabled ? "ON" : "OFF"}`;
  elements.mzTextPreviewToggleButton.setAttribute("aria-pressed", state.mzTextPreviewEnabled ? "true" : "false");
}

export async function updateApp() {
  const ok = confirm(
    "アプリ本体を更新します。\n" +
    "保存済みメモは消えません。\n" +
    "画面を再読み込みします。よろしいですか？"
  );
  if (!ok) return;

  try {
    await clearAppCachesIfAvailable();
    await updateServiceWorkersIfAvailable();
  } catch (error) {
    console.warn("アプリ更新前のキャッシュ更新に失敗しました。再読み込みは続行します。", error);
  }

  const url = new URL(window.location.href);
  url.searchParams.set("appUpdate", String(Date.now()));
  window.location.replace(url.toString());
}

function applyTheme(theme) {
  state.theme = theme;
  document.body.classList.toggle("dark-theme", theme === DARK_THEME);
  renderThemeButton();
}

function applyMzDisplayMode(mode) {
  state.mzDisplayMode = mode;
}

function loadMzTextPreviewSettings() {
  const savedGlobalValue = localStorage.getItem(MZ_TEXT_PREVIEW_GLOBAL_STORAGE_KEY);
  if (savedGlobalValue !== null) {
    state.mzTextPreviewEnabled = parseMzTextPreviewBoolean(savedGlobalValue);
    return;
  }

  state.mzTextPreviewEnabled = migrateLegacyMzTextPreviewSetting();
  saveMzTextPreviewSetting();
}

function parseMzTextPreviewBoolean(value) {
  try {
    const parsedValue = JSON.parse(value);
    if (typeof parsedValue !== "boolean") {
      console.warn("MZ表示設定が想定外の形式です。");
      return false;
    }

    return parsedValue;
  } catch (error) {
    console.warn("MZ表示設定の読み込みに失敗しました。", error);
    return false;
  }
}

function migrateLegacyMzTextPreviewSetting() {
  try {
    const savedValue = localStorage.getItem(MZ_TEXT_PREVIEW_LEGACY_STORAGE_KEY);
    if (savedValue === null) return false;

    const noteIds = JSON.parse(savedValue);
    if (!Array.isArray(noteIds)) {
      console.warn("旧MZ表示設定が想定外の形式です。");
      return false;
    }

    return noteIds.length > 0;
  } catch (error) {
    console.warn("旧MZ表示設定の移行に失敗しました。", error);
    return false;
  }
}

function saveMzTextPreviewSetting() {
  localStorage.setItem(
    MZ_TEXT_PREVIEW_GLOBAL_STORAGE_KEY,
    JSON.stringify(state.mzTextPreviewEnabled)
  );
}

async function clearAppCachesIfAvailable() {
  if (!("caches" in window)) return;

  const keys = await window.caches.keys();
  await Promise.all(keys.map((key) => window.caches.delete(key)));
}

async function updateServiceWorkersIfAvailable() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.update()));
}
