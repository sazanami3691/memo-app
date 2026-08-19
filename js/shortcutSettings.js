"use strict";

import {
  addShortcutGroup,
  getNoteShortcutGroupIds,
  updateNoteShortcutGroups
} from "./shortcutGroups.js";
import { appActions, elements, state } from "./state.js";

export function getNoteShortcutGroupCount(noteId) {
  return getNoteShortcutGroupIds(state.shortcutGroups, noteId).length;
}

export function openShortcutSettingsModal() {
  const note = state.notes.find((item) => item.id === state.selectedNoteId);
  if (!note || !elements.shortcutSettingsModal) return;

  state.shortcutSettingsNoteId = note.id;
  state.shortcutSettingsSelectedGroupIds = new Set(
    getNoteShortcutGroupIds(state.shortcutGroups, note.id)
  );
  renderShortcutSettingsModal();
  elements.shortcutSettingsModal.classList.remove("hidden");
  elements.shortcutSettingsModal.setAttribute("aria-hidden", "false");
}

export function closeShortcutSettingsModal() {
  if (!elements.shortcutSettingsModal) return;
  elements.shortcutSettingsModal.classList.add("hidden");
  elements.shortcutSettingsModal.setAttribute("aria-hidden", "true");
  state.shortcutSettingsNoteId = null;
  state.shortcutSettingsSelectedGroupIds = new Set();
}

export async function saveShortcutSettings() {
  const noteId = state.shortcutSettingsNoteId;
  if (!noteId) return;

  try {
    await updateNoteShortcutGroups(noteId, [...state.shortcutSettingsSelectedGroupIds]);
    closeShortcutSettingsModal();
    appActions.renderAll();
  } catch (error) {
    console.error(error);
    alert("ショートカット設定を保存できませんでした。");
  }
}

export async function createShortcutGroupFromSettings() {
  const name = prompt("ショートカットグループ名を入力してください");
  if (name === null) return;

  try {
    const group = await addShortcutGroup(name);
    state.shortcutSettingsSelectedGroupIds.add(group.id);
    renderShortcutSettingsModal();
    appActions.renderAll();
  } catch (error) {
    console.error(error);
    alert(error.message || "ショートカットグループを追加できませんでした。");
  }
}

export function renderShortcutSettingsModal() {
  if (!elements.shortcutSettingsGroupList) return;
  const note = state.notes.find((item) => item.id === state.shortcutSettingsNoteId);
  if (!note) {
    closeShortcutSettingsModal();
    return;
  }

  elements.shortcutSettingsNoteTitle.textContent = note.title || "無題";
  elements.shortcutSettingsGroupList.innerHTML = "";
  if (state.shortcutGroups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "shortcut-settings-empty";
    empty.textContent = "ショートカットグループはまだありません。";
    elements.shortcutSettingsGroupList.appendChild(empty);
    return;
  }

  state.shortcutGroups.forEach((group) => {
    const label = document.createElement("label");
    label.className = "shortcut-settings-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = group.id;
    checkbox.checked = state.shortcutSettingsSelectedGroupIds.has(group.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.shortcutSettingsSelectedGroupIds.add(group.id);
      } else {
        state.shortcutSettingsSelectedGroupIds.delete(group.id);
      }
    });

    const name = document.createElement("span");
    name.textContent = group.name;
    label.append(checkbox, name);
    elements.shortcutSettingsGroupList.appendChild(label);
  });
}
