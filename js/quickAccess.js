"use strict";

import { getFolderPath } from "./noteNavigation.js";
import { elements, state } from "./state.js";

const FAVORITES_SECTION = "favorites";
const SHORTCUTS_SECTION = "shortcuts";
const DEFAULT_EXPANDED_SECTIONS = [FAVORITES_SECTION, SHORTCUTS_SECTION];

export function resetQuickAccessSections() {
  state.quickAccessExpandedSections = new Set(DEFAULT_EXPANDED_SECTIONS);
}

export function renderQuickAccess(onOpenNote) {
  if (!elements.quickAccessSections) return;

  elements.quickAccessSections.innerHTML = "";
  const sections = [
    {
      id: FAVORITES_SECTION,
      title: "よく使う項目",
      emptyText: "お気に入りはまだありません。",
      items: createNoteItems((note) => note.isPinned === true, "📌", onOpenNote)
    },
    {
      id: SHORTCUTS_SECTION,
      title: "ショートカット",
      emptyText: "ショートカットはまだありません。",
      items: createNoteItems((note) => note.isShortcut === true, "🔖", onOpenNote)
    }
  ];

  sections.forEach((section) => {
    elements.quickAccessSections.appendChild(createQuickAccessSection(section, onOpenNote));
  });
}

function createNoteItems(predicate, icon, onOpenNote) {
  return state.notes
    .filter(predicate)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((note) => ({
      type: "note",
      id: note.id,
      icon,
      title: note.title || "無題",
      meta: getFolderPath(note.folderId),
      onOpen: () => onOpenNote(note.id)
    }));
}

function createQuickAccessSection(section, onOpenNote) {
  const container = document.createElement("section");
  container.className = "quick-access-section";
  const isExpanded = state.quickAccessExpandedSections.has(section.id);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "quick-access-section-toggle";
  toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  toggle.addEventListener("click", () => {
    if (state.quickAccessExpandedSections.has(section.id)) {
      state.quickAccessExpandedSections.delete(section.id);
    } else {
      state.quickAccessExpandedSections.add(section.id);
    }
    renderQuickAccess(onOpenNote);
  });

  const indicator = document.createElement("span");
  indicator.className = "quick-access-section-indicator";
  indicator.textContent = isExpanded ? "▼" : "▶";
  indicator.setAttribute("aria-hidden", "true");

  const title = document.createElement("span");
  title.className = "quick-access-section-title";
  title.textContent = section.title;

  const count = document.createElement("span");
  count.className = "quick-access-section-count";
  count.textContent = String(section.items.length);

  toggle.append(indicator, title, count);
  container.appendChild(toggle);
  if (!isExpanded) return container;

  const list = document.createElement("div");
  list.className = "quick-access-list";
  if (section.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "quick-access-empty";
    empty.textContent = section.emptyText;
    list.appendChild(empty);
  } else {
    section.items.forEach((item) => list.appendChild(createQuickAccessItemButton(item)));
  }
  container.appendChild(list);
  return container;
}

function createQuickAccessItemButton(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quick-access-item";
  button.dataset.itemType = item.type;
  button.dataset.itemId = item.id;
  button.setAttribute("aria-label", `${item.title}（${item.meta}）`);
  button.addEventListener("click", item.onOpen);

  const icon = document.createElement("span");
  icon.className = "quick-access-item-icon";
  icon.textContent = item.icon;
  icon.setAttribute("aria-hidden", "true");

  const body = document.createElement("span");
  body.className = "quick-access-item-body";

  const title = document.createElement("span");
  title.className = "quick-access-item-title";
  title.textContent = item.title;

  const meta = document.createElement("span");
  meta.className = "quick-access-item-meta";
  meta.textContent = item.meta;

  body.append(title, meta);
  button.append(icon, body);
  return button;
}
