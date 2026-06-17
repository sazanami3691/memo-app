"use strict";

import { collectAssetIdsFromNotes, deleteUnusedAssets } from "./assets.js";
import { deleteFolder, deleteNote, saveFolder } from "./db.js";
import { appActions, elements, state } from "./state.js";
import { createEmptyList, createId, normalizeName } from "./utils.js";

export function createFolderObject(name, parentId) {
  const now = Date.now();
  return {
    id: createId("folder"),
    parentId,
    name,
    createdAt: now,
    updatedAt: now
  };
}

export async function ensureInitialFolder() {
  if (state.folders.length > 0) return;

  const folder = createFolderObject("未分類", null);
  await saveFolder(folder);
  state.folders.push(folder);
}

export function selectInitialFolder() {
  const sortedFolders = getSortedFolders();
  state.selectedFolderId = sortedFolders[0] ? sortedFolders[0].id : null;
}

export async function createParentFolder() {
  const name = prompt("親フォルダ名を入力してください");
  const cleanName = normalizeName(name);
  if (!cleanName) return;

  const folder = createFolderObject(cleanName, null);
  await saveFolder(folder);
  state.folders.push(folder);
  state.selectedFolderId = folder.id;
  state.selectedNoteId = null;
  appActions.renderAll();
}

export async function createChildFolder() {
  const parentFolder = getFolderForChildCreation();
  if (!parentFolder) {
    alert("子フォルダは親フォルダの下にだけ作成できます。");
    return;
  }

  const name = prompt(`「${parentFolder.name}」の子フォルダ名を入力してください`);
  const cleanName = normalizeName(name);
  if (!cleanName) return;

  const folder = createFolderObject(cleanName, parentFolder.id);
  await saveFolder(folder);
  state.folders.push(folder);
  state.selectedFolderId = folder.id;
  state.selectedNoteId = null;
  appActions.renderAll();
}

function getFolderForChildCreation() {
  const selectedFolder = getSelectedFolder();
  if (!selectedFolder) return null;
  return selectedFolder.parentId ? null : selectedFolder;
}

export async function renameSelectedFolder() {
  const folder = getSelectedFolder();
  if (!folder) return;

  const name = prompt("新しいフォルダ名を入力してください", folder.name);
  const cleanName = normalizeName(name);
  if (!cleanName) return;

  folder.name = cleanName;
  folder.updatedAt = Date.now();
  await saveFolder(folder);
  appActions.renderAll();
}

export async function deleteSelectedFolder() {
  const folder = getSelectedFolder();
  if (!folder) return;

  const targetFolderIds = getDescendantFolderIds(folder.id);
  targetFolderIds.unshift(folder.id);
  const targetNotes = state.notes.filter((note) => targetFolderIds.includes(note.folderId));
  const targetNoteIds = targetNotes.map((note) => note.id);
  const maybeUnusedAssetIds = collectAssetIdsFromNotes(targetNotes);

  const message = `「${folder.name}」を削除します。\n子フォルダと中のメモも削除されます。よろしいですか？`;
  if (!confirm(message)) return;

  for (const noteId of targetNoteIds) {
    await deleteNote(noteId);
  }

  for (const folderId of targetFolderIds) {
    await deleteFolder(folderId);
  }

  state.notes = state.notes.filter((note) => !targetNoteIds.includes(note.id));
  state.folders = state.folders.filter((item) => !targetFolderIds.includes(item.id));
  await deleteUnusedAssets(maybeUnusedAssetIds);

  state.selectedNoteId = null;
  state.selectedFolderId = state.folders[0] ? getSortedFolders()[0].id : null;

  if (state.folders.length === 0) {
    await ensureInitialFolder();
    state.selectedFolderId = state.folders[0].id;
  }

  appActions.renderAll();
}

export function renderFolderList() {
  elements.folderList.innerHTML = "";
  const sortedParents = getSortedFolders().filter((folder) => !folder.parentId);

  if (sortedParents.length === 0) {
    elements.folderList.appendChild(createEmptyList("フォルダがありません。"));
    return;
  }

  sortedParents.forEach((parent) => {
    elements.folderList.appendChild(createFolderButton(parent, false));

    const children = getSortedFolders().filter((folder) => folder.parentId === parent.id);
    children.forEach((child) => {
      elements.folderList.appendChild(createFolderButton(child, true));
    });
  });
}

export function createFolderButton(folder, isChild) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `folder-item${isChild ? " child-folder" : ""}${folder.id === state.selectedFolderId ? " selected" : ""}`;
  button.addEventListener("click", () => {
    state.selectedFolderId = folder.id;
    state.selectedNoteId = null;
    appActions.renderAll();
  });

  const name = document.createElement("span");
  name.className = "folder-name";
  name.textContent = folder.name;

  const depth = document.createElement("span");
  depth.className = "folder-depth";
  depth.textContent = isChild ? "子" : "親";

  button.append(name, depth);
  return button;
}

export function getSelectedFolder() {
  return state.folders.find((folder) => folder.id === state.selectedFolderId) || null;
}

export function getSortedFolders() {
  return [...state.folders].sort((a, b) => {
    if (a.parentId === b.parentId) {
      return a.createdAt - b.createdAt;
    }
    return String(a.parentId || "").localeCompare(String(b.parentId || ""));
  });
}

export function getDescendantFolderIds(folderId) {
  return state.folders
    .filter((folder) => folder.parentId === folderId)
    .map((folder) => folder.id);
}
