"use strict";

import {
  elements,
  MZ_DISPLAY_MODE_STORAGE_KEY,
  state,
  THEME_STORAGE_KEY,
  UI_STYLE_STORAGE_KEY
} from "./state.js";

const LIGHT_THEME = "light";
const DARK_THEME = "dark";
const MZ_DISPLAY_NORMAL = "normal";
const MZ_DISPLAY_WINDOW = "window";
const UI_STYLE_NORMAL = "normal";
const UI_STYLE_MZ = "mz";

export function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(savedTheme === DARK_THEME ? DARK_THEME : LIGHT_THEME);
}

export function initializeMzDisplayMode() {
  const savedMode = localStorage.getItem(MZ_DISPLAY_MODE_STORAGE_KEY);
  applyMzDisplayMode(savedMode === MZ_DISPLAY_NORMAL ? MZ_DISPLAY_NORMAL : MZ_DISPLAY_WINDOW);
}

export function initializeUiStyle() {
  const savedStyle = localStorage.getItem(UI_STYLE_STORAGE_KEY);
  applyUiStyle(savedStyle === UI_STYLE_MZ ? UI_STYLE_MZ : UI_STYLE_NORMAL);
}

export function toggleTheme() {
  const nextTheme = state.theme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
}

export function toggleMzDisplayMode() {
  const nextMode = state.mzDisplayMode === MZ_DISPLAY_WINDOW ? MZ_DISPLAY_NORMAL : MZ_DISPLAY_WINDOW;
  localStorage.setItem(MZ_DISPLAY_MODE_STORAGE_KEY, nextMode);
  applyMzDisplayMode(nextMode);
}

export function toggleUiStyle() {
  const nextStyle = state.uiStyle === UI_STYLE_MZ ? UI_STYLE_NORMAL : UI_STYLE_MZ;
  localStorage.setItem(UI_STYLE_STORAGE_KEY, nextStyle);
  applyUiStyle(nextStyle);
}

export function renderThemeButton() {
  if (!elements.themeToggleButton) return;

  elements.themeToggleButton.textContent = state.theme === DARK_THEME
    ? "ライトテーマに切替"
    : "ダークテーマに切替";
}

export function renderMzDisplayModeButton() {
  if (!elements.mzDisplayModeButton) return;

  elements.mzDisplayModeButton.textContent = state.mzDisplayMode === MZ_DISPLAY_WINDOW
    ? "MZ表示を通常にする"
    : "MZ表示をウィンドウにする";
}

export function renderUiStyleButton() {
  if (!elements.mzUiModeButton) return;

  elements.mzUiModeButton.textContent = state.uiStyle === UI_STYLE_MZ
    ? "MZ風UIを解除する"
    : "MZ風UIを有効にする";
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
  renderMzDisplayModeButton();
}

function applyUiStyle(style) {
  state.uiStyle = style;
  document.body.classList.toggle("mz-ui-theme", style === UI_STYLE_MZ);
  renderUiStyleButton();
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
