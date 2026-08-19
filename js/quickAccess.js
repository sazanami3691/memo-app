"use strict";

import { getFolderPath } from "./noteNavigation.js";
import {
  addShortcutGroup,
  deleteShortcutGroup,
  getShortcutGroupSectionId,
  renameShortcutGroup
} from "./shortcutGroups.js";
import { appActions, elements, state } from "./state.js";

const FAVORITES_SECTION = "favorites";

export function resetQuickAccessSections() {
  state.quickAccessExpandedSections = new Set([
    FAVORITES_SECTION,
    ...state.shortcutGroups.map((group) => getShortcutGroupSectionId(group.id))
  ]);
}

export function renderQuickAccess(onOpenNote) {
  if (!elements.quickAccessSections) return;

  elements.quickAccessSections.innerHTML = "";
  const sections = [{
    id: FAVORITES_SECTION,
    title: "よく使う項目",
    emptyText: "お気に入りはまだありません。",
    items: createNoteItems((note) => note.isPinned === true, "📌", onOpenNote)
  }, ...state.shortcutGroups.map((group) => ({
    id: getShortcutGroupSectionId(group.id),
    groupId: group.id,
    title: `📁 ${group.name}`,
    emptyText: "このグループにはメモがありません。",
    items: createNoteItemsForGroup(group, onOpenNote)
  }))];

  sections.forEach((section) => {
    elements.quickAccessSections.appendChild(createQuickAccessSection(section, onOpenNote));
  });

  if (state.shortcutGroups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "quick-access-groups-empty";
    empty.textContent = "ショートカットグループはまだありません。";
    elements.quickAccessSections.appendChild(empty);
  }

  const addGroupButton = document.createElement("button");
  addGroupButton.type = "button";
  addGroupButton.className = "quick-access-add-group";
  addGroupButton.textContent = "＋ ショートカットグループを追加";
  addGroupButton.addEventListener("click", handleAddGroup);
  elements.quickAccessSections.appendChild(addGroupButton);
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

function createNoteItemsForGroup(group, onOpenNote) {
  const noteIds = new Set(group.items
    .filter((item) => item.type === "note")
    .map((item) => item.id));
  return createNoteItems((note) => noteIds.has(note.id), "🔖", onOpenNote);
}

function createQuickAccessSection(section, onOpenNote) {
  const container = document.createElement("section");
  container.className = "quick-access-section";
  const isExpanded = state.quickAccessExpandedSections.has(section.id);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "quick-access-section-toggle";
  toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
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

  if (section.groupId) {
    container.appendChild(createGroupActions(section.groupId));
  }

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

function createGroupActions(groupId) {
  const actions = document.createElement("div");
  actions.className = "quick-access-group-actions";

  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.textContent = "名前を変更";
  renameButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const group = state.shortcutGroups.find((item) => item.id === groupId);
    if (!group) return;
    const name = prompt("新しいショートカットグループ名を入力してください", group.name);
    if (name === null || name.trim() === group.name) return;
    try {
      await renameShortcutGroup(groupId, name);
      appActions.renderAll();
    } catch (error) {
      console.error(error);
      alert(error.message || "グループ名を変更できませんでした。");
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-button";
  deleteButton.textContent = "グループを削除";
  deleteButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const group = state.shortcutGroups.find((item) => item.id === groupId);
    if (!group) return;
    const ok = confirm(
      `「${group.name}」を削除します。\n` +
      "この操作ではショートカットグループだけが削除されます。\n" +
      "登録されているメモ本体は削除されません。\n" +
      "削除してよろしいですか？"
    );
    if (!ok) return;
    try {
      await deleteShortcutGroup(groupId);
      appActions.renderAll();
    } catch (error) {
      console.error(error);
      alert("ショートカットグループを削除できませんでした。");
    }
  });

  actions.append(renameButton, deleteButton);
  return actions;
}

async function handleAddGroup(event) {
  event.preventDefault();
  event.stopPropagation();
  const name = prompt("ショートカットグループ名を入力してください");
  if (name === null) return;
  try {
    await addShortcutGroup(name);
    appActions.renderAll();
  } catch (error) {
    console.error(error);
    alert(error.message || "ショートカットグループを追加できませんでした。");
  }
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
