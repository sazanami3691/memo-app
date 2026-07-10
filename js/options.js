"use strict";

import { elements, state, THEME_STORAGE_KEY } from "./state.js";

const LIGHT_THEME = "light";
const DARK_THEME = "dark";
const MZ_DISPLAY_WINDOW = "window";

export function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(savedTheme === DARK_THEME ? DARK_THEME : LIGHT_THEME);
}

export function initializeMzDisplayMode() {
  applyMzDisplayMode(MZ_DISPLAY_WINDOW);
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
