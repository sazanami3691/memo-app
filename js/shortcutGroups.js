"use strict";

import { saveNote } from "./db.js";
import {
  SHORTCUT_GROUPS_STORAGE_KEY,
  state
} from "./state.js";
import { createId } from "./utils.js";

export const DEFAULT_SHORTCUT_GROUP_NAME = "ショートカット";
export const SHORTCUT_GROUP_NAME_MAX_LENGTH = 40;
const SHORTCUT_GROUP_SECTION_PREFIX = "shortcut-group:";

export function getShortcutGroupSectionId(groupId) {
  return `${SHORTCUT_GROUP_SECTION_PREFIX}${groupId}`;
}

export function normalizeShortcutGroupName(value) {
  return typeof value === "string"
    ? value.trim().slice(0, SHORTCUT_GROUP_NAME_MAX_LENGTH)
    : "";
}

export function validateShortcutGroups(groups, validNoteIds = null) {
  if (!Array.isArray(groups)) {
    throw new Error("shortcutGroupsが配列ではありません。");
  }

  const groupIds = new Set();
  const groupNames = new Set();
  groups.forEach((group) => {
    if (!isRecord(group) || !isNonEmptyString(group.id)) {
      throw new Error("不正なショートカットグループIDが含まれています。");
    }
    if (groupIds.has(group.id)) {
      throw new Error("重複したショートカットグループIDが含まれています。");
    }
    groupIds.add(group.id);

    if (typeof group.name !== "string") {
      throw new Error("ショートカットグループ名が不正です。");
    }
    const cleanName = normalizeShortcutGroupName(group.name);
    if (!cleanName || cleanName !== group.name.trim()) {
      throw new Error("ショートカットグループ名が不正です。");
    }
    if (group.name.trim().length > SHORTCUT_GROUP_NAME_MAX_LENGTH) {
      throw new Error("ショートカットグループ名が長すぎます。");
    }
    if (groupNames.has(cleanName)) {
      throw new Error("同じ名前のショートカットグループが重複しています。");
    }
    groupNames.add(cleanName);
    if (!Array.isArray(group.items)) {
      throw new Error("ショートカットグループのitemsが配列ではありません。");
    }

    const itemKeys = new Set();
    group.items.forEach((item) => {
      if (!isRecord(item) || item.type !== "note" || !isNonEmptyString(item.id)) {
        throw new Error("不正なショートカット項目が含まれています。");
      }
      const itemKey = `${item.type}:${item.id}`;
      if (itemKeys.has(itemKey)) {
        throw new Error("同じショートカット項目が重複しています。");
      }
      if (validNoteIds && !validNoteIds.has(item.id)) {
        throw new Error("存在しないメモを参照するショートカットが含まれています。");
      }
      itemKeys.add(itemKey);
    });
  });
  return true;
}

export function normalizeShortcutGroups(groups, validNoteIds = null) {
  const now = Date.now();
  const seenGroupIds = new Set();
  return (Array.isArray(groups) ? groups : []).flatMap((group) => {
    if (!isRecord(group) || !isNonEmptyString(group.id) || seenGroupIds.has(group.id)) {
      return [];
    }
    const name = normalizeShortcutGroupName(group.name);
    if (!name) return [];
    seenGroupIds.add(group.id);

    const seenItems = new Set();
    const items = (Array.isArray(group.items) ? group.items : []).flatMap((item) => {
      if (!isRecord(item) || item.type !== "note" || !isNonEmptyString(item.id)) {
        return [];
      }
      if (validNoteIds && !validNoteIds.has(item.id)) return [];
      const itemKey = `${item.type}:${item.id}`;
      if (seenItems.has(itemKey)) return [];
      seenItems.add(itemKey);
      return [{ type: "note", id: item.id }];
    });

    return [{
      id: group.id,
      name,
      items,
      createdAt: Number.isFinite(group.createdAt) ? group.createdAt : now,
      updatedAt: Number.isFinite(group.updatedAt) ? group.updatedAt : now
    }];
  });
}

export function createLegacyShortcutGroups(
  notes,
  { now = Date.now(), idFactory = createId } = {}
) {
  const items = notes
    .filter((note) => note?.isShortcut === true && isNonEmptyString(note.id))
    .map((note) => ({ type: "note", id: note.id }));
  return [{
    id: createUniqueGroupId([], idFactory),
    name: DEFAULT_SHORTCUT_GROUP_NAME,
    items,
    createdAt: now,
    updatedAt: now
  }];
}

export function getNoteShortcutGroupIds(groups, noteId) {
  return groups
    .filter((group) => group.items.some((item) => item.type === "note" && item.id === noteId))
    .map((group) => group.id);
}

export function setNoteShortcutGroupIds(groups, noteId, groupIds, now = Date.now()) {
  const selectedGroupIds = new Set(groupIds);
  return groups.map((group) => {
    const hasItem = group.items.some((item) => item.type === "note" && item.id === noteId);
    const shouldHaveItem = selectedGroupIds.has(group.id);
    if (hasItem === shouldHaveItem) return cloneGroup(group);

    const items = group.items.filter((item) => !(item.type === "note" && item.id === noteId));
    if (shouldHaveItem) items.push({ type: "note", id: noteId });
    return {
      ...cloneGroup(group),
      items,
      updatedAt: now
    };
  });
}

export function removeNoteIdsFromShortcutGroups(groups, noteIds, now = Date.now()) {
  const removedNoteIds = new Set(noteIds);
  return groups.map((group) => {
    const items = group.items.filter((item) => (
      item.type !== "note" || !removedNoteIds.has(item.id)
    ));
    return items.length === group.items.length
      ? cloneGroup(group)
      : { ...cloneGroup(group), items, updatedAt: now };
  });
}

export function applyShortcutFlagsToNotes(notes, groups) {
  const shortcutNoteIds = collectShortcutNoteIds(groups);
  return notes.map((note) => ({
    ...note,
    isShortcut: shortcutNoteIds.has(note.id)
  }));
}

export function resolveShortcutGroupsForRestore(
  backupShortcutGroups,
  notes,
  { now = Date.now(), idFactory = createId } = {}
) {
  const validNoteIds = new Set(notes.map((note) => note.id));
  if (backupShortcutGroups === undefined) {
    return createLegacyShortcutGroups(notes, { now, idFactory });
  }
  validateShortcutGroups(backupShortcutGroups, validNoteIds);
  return normalizeShortcutGroups(backupShortcutGroups, validNoteIds);
}

export async function initializeShortcutGroups({
  storage = globalThis.localStorage,
  now = Date.now(),
  idFactory = createId,
  saveNoteFn = saveNote
} = {}) {
  const validNoteIds = new Set(state.notes.map((note) => note.id));
  let groups;
  let shouldSave = false;

  try {
    const rawValue = storage.getItem(SHORTCUT_GROUPS_STORAGE_KEY);
    if (rawValue === null) {
      groups = createLegacyShortcutGroups(state.notes, { now, idFactory });
      shouldSave = true;
    } else {
      const parsed = JSON.parse(rawValue);
      validateShortcutGroups(parsed);
      groups = normalizeShortcutGroups(parsed, validNoteIds);
      shouldSave = JSON.stringify(parsed) !== JSON.stringify(groups);
    }
  } catch (error) {
    console.warn("ショートカットグループ設定を読み込めませんでした。旧設定から再構築します。", error);
    groups = createLegacyShortcutGroups(state.notes, { now, idFactory });
    shouldSave = true;
  }

  state.shortcutGroups = groups;
  if (shouldSave) {
    try {
      saveShortcutGroupsToStorage(groups, storage);
    } catch (error) {
      console.warn("ショートカットグループ設定を保存できませんでした。", error);
    }
  }
  try {
    await synchronizeShortcutFlags(state.notes, groups, saveNoteFn);
  } catch (error) {
    console.warn("メモのisShortcut互換フラグを同期できませんでした。", error);
  }
  return groups;
}

export function getShortcutGroupsForBackup() {
  return state.shortcutGroups.map(cloneGroup);
}

export function saveShortcutGroupsToStorage(groups, storage = globalThis.localStorage) {
  storage.setItem(SHORTCUT_GROUPS_STORAGE_KEY, JSON.stringify(groups));
}

export async function replaceShortcutGroups(groups, {
  notes = state.notes,
  storage = globalThis.localStorage,
  saveNoteFn = saveNote,
  syncFlags = true,
  resetExpandedSections = false
} = {}) {
  const validNoteIds = new Set(notes.map((note) => note.id));
  const normalized = normalizeShortcutGroups(groups, validNoteIds);
  saveShortcutGroupsToStorage(normalized, storage);
  state.shortcutGroups = normalized;
  if (resetExpandedSections) {
    state.quickAccessExpandedSections = new Set([
      "favorites",
      ...normalized.map((group) => getShortcutGroupSectionId(group.id))
    ]);
  }
  if (syncFlags) {
    await synchronizeShortcutFlags(notes, normalized, saveNoteFn);
  }
  return normalized;
}

export async function addShortcutGroup(name, options = {}) {
  const cleanName = validateNewGroupName(name, state.shortcutGroups);
  const now = options.now ?? Date.now();
  const idFactory = options.idFactory || createId;
  const group = {
    id: createUniqueGroupId(state.shortcutGroups, idFactory),
    name: cleanName,
    items: [],
    createdAt: now,
    updatedAt: now
  };
  await replaceShortcutGroups([...state.shortcutGroups, group], options);
  state.quickAccessExpandedSections.add(getShortcutGroupSectionId(group.id));
  return group;
}

export async function renameShortcutGroup(groupId, name, options = {}) {
  const target = state.shortcutGroups.find((group) => group.id === groupId);
  if (!target) throw new Error("ショートカットグループが見つかりません。");
  const cleanName = validateNewGroupName(name, state.shortcutGroups, groupId);
  const now = options.now ?? Date.now();
  const nextGroups = state.shortcutGroups.map((group) => (
    group.id === groupId
      ? { ...cloneGroup(group), name: cleanName, updatedAt: now }
      : cloneGroup(group)
  ));
  await replaceShortcutGroups(nextGroups, options);
  return state.shortcutGroups.find((group) => group.id === groupId);
}

export async function deleteShortcutGroup(groupId, options = {}) {
  const target = state.shortcutGroups.find((group) => group.id === groupId);
  if (!target) return null;
  const nextGroups = state.shortcutGroups
    .filter((group) => group.id !== groupId)
    .map(cloneGroup);
  await replaceShortcutGroups(nextGroups, options);
  state.quickAccessExpandedSections.delete(getShortcutGroupSectionId(groupId));
  return target;
}

export async function updateNoteShortcutGroups(noteId, groupIds, options = {}) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) throw new Error("メモが見つかりません。");
  const validGroupIds = new Set(state.shortcutGroups.map((group) => group.id));
  const selectedGroupIds = [...new Set(groupIds)].filter((groupId) => validGroupIds.has(groupId));
  const nextGroups = setNoteShortcutGroupIds(
    state.shortcutGroups,
    noteId,
    selectedGroupIds,
    options.now ?? Date.now()
  );
  await replaceShortcutGroups(nextGroups, options);
  return selectedGroupIds;
}

export async function removeNotesFromShortcutGroups(noteIds, options = {}) {
  const nextGroups = removeNoteIdsFromShortcutGroups(
    state.shortcutGroups,
    noteIds,
    options.now ?? Date.now()
  );
  return replaceShortcutGroups(nextGroups, {
    ...options,
    syncFlags: options.syncFlags ?? false
  });
}

export async function synchronizeShortcutFlags(
  notes = state.notes,
  groups = state.shortcutGroups,
  saveNoteFn = saveNote
) {
  const shortcutNoteIds = collectShortcutNoteIds(groups);
  const changedNotes = notes.filter((note) => (
    note.isShortcut !== shortcutNoteIds.has(note.id)
  ));
  for (const note of changedNotes) {
    note.isShortcut = shortcutNoteIds.has(note.id);
    await saveNoteFn(note);
  }
  return changedNotes;
}

function validateNewGroupName(name, groups, excludedGroupId = null) {
  const originalName = typeof name === "string" ? name.trim() : "";
  if (!originalName) throw new Error("グループ名を入力してください。");
  if (originalName.length > SHORTCUT_GROUP_NAME_MAX_LENGTH) {
    throw new Error(`グループ名は${SHORTCUT_GROUP_NAME_MAX_LENGTH}文字以内にしてください。`);
  }
  if (groups.some((group) => group.id !== excludedGroupId && group.name === originalName)) {
    throw new Error("同じ名前のショートカットグループがあります。");
  }
  return originalName;
}

function createUniqueGroupId(groups, idFactory) {
  const usedIds = new Set(groups.map((group) => group.id));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = idFactory("shortcutGroup");
    if (isNonEmptyString(id) && !usedIds.has(id)) return id;
  }
  throw new Error("一意のショートカットグループIDを生成できませんでした。");
}

function collectShortcutNoteIds(groups) {
  return new Set(groups.flatMap((group) => group.items
    .filter((item) => item.type === "note")
    .map((item) => item.id)));
}

function cloneGroup(group) {
  return {
    ...group,
    items: group.items.map((item) => ({ ...item }))
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
