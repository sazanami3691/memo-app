"use strict";

import { collectAssetIdsFromNotes, deleteUnusedAssets } from "./assets.js";
import { deleteFolder, deleteNote, saveFolder } from "./db.js";
import { appActions, elements, state } from "./state.js";
import { createEmptyList, createId, formatDate, normalizeName } from "./utils.js";

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
  state.appView = "folders";
  state.folderNavLevel = "parents";
  state.activeParentFolderId = null;
  state.activeChildFolderId = null;
  state.selectedFolderId = null;
  state.selectedNoteId = null;
  state.searchQuery = "";
  state.searchReturnState = null;
  state.editorReturnView = null;
}

export async function createParentFolder() {
  const name = prompt("親フォルダ名を入力してください");
  const cleanName = normalizeName(name);
  if (!cleanName) return;

  const folder = createFolderObject(cleanName, null);
  await saveFolder(folder);
  state.folders.push(folder);
  state.appView = "folders";
  state.folderNavLevel = "children";
  state.activeParentFolderId = folder.id;
  state.activeChildFolderId = null;
  state.selectedFolderId = folder.id;
  state.selectedNoteId = null;
  state.editorReturnView = null;
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
  state.appView = "folders";
  state.folderNavLevel = "children";
  state.activeParentFolderId = parentFolder.id;
  state.activeChildFolderId = null;
  state.selectedFolderId = parentFolder.id;
  state.selectedNoteId = null;
  state.editorReturnView = null;
  appActions.renderAll();
}

function getFolderForChildCreation() {
  if (state.activeParentFolderId) {
    return state.folders.find((folder) => folder.id === state.activeParentFolderId) || null;
  }

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

  state.appView = "folders";
  state.folderNavLevel = "parents";
  state.activeParentFolderId = null;
  state.activeChildFolderId = null;
  state.selectedNoteId = null;
  state.selectedFolderId = null;

  if (state.folders.length === 0) {
    await ensureInitialFolder();
  }

  appActions.renderAll();
}

export function renderFolderList() {
  elements.folderList.innerHTML = "";

  if (state.folderNavLevel === "children") {
    renderChildFolderScreen();
    return;
  }

  if (state.folderNavLevel === "notes") {
    renderNotesFolderScreen();
    return;
  }

  renderParentFolderScreen();
}

function renderParentFolderScreen() {
  const sortedParents = getSortedFolders().filter((folder) => !folder.parentId);

  if (sortedParents.length === 0) {
    elements.folderList.appendChild(createEmptyList("フォルダがありません。"));
    return;
  }

  const header = createNavScreenHeader(null, "親フォルダ");
  elements.folderList.appendChild(header);

  const list = document.createElement("div");
  list.className = "nav-list";

  sortedParents.forEach((parent) => {
    list.appendChild(createParentFolderButton(parent));
  });

  elements.folderList.appendChild(list);
}

function renderChildFolderScreen() {
  const parent = getActiveParentFolder();
  if (!parent) {
    goToParentFolderList();
    return;
  }

  elements.folderList.appendChild(createNavScreenHeader(null, parent.name));

  const list = document.createElement("div");
  list.className = "nav-list";

  const children = getSortedFolders().filter((folder) => folder.parentId === parent.id);
  children.forEach((child) => {
    list.appendChild(createChildFolderButton(child));
  });

  const notes = getNotesInFolder(parent.id);
  notes.forEach((note) => {
    list.appendChild(createParentNoteButton(note, parent.id));
  });

  if (children.length === 0 && notes.length === 0) {
    list.appendChild(createNavEmptyMessage("このフォルダにはまだ項目がありません。"));
  }

  elements.folderList.appendChild(list);
}

function renderNotesFolderScreen() {
  const folder = getSelectedFolder();
  if (!folder) {
    goToParentFolderList();
    return;
  }

  elements.folderList.appendChild(createNavScreenHeader(null, folder.name));

  const info = document.createElement("div");
  info.className = "nav-current-folder";
  info.textContent = "中央の一覧からメモを選択してください。";
  elements.folderList.appendChild(info);
}

function createParentFolderButton(parent) {
  const childCount = state.folders.filter((folder) => folder.parentId === parent.id).length;
  const noteCount = countNotesInFolder(parent.id);
  return createNavListItem({
    icon: "📁",
    title: parent.name,
    meta: `子フォルダ ${childCount} / メモ ${noteCount}`,
    actionText: "＞",
    onClick: () => openParentFolder(parent.id)
  });
}

function createParentNoteButton(note, parentFolderId) {
  return createNavListItem({
    icon: note.isPinned === true ? "📌 📝" : "📝",
    title: note.title || "無題",
    meta: `更新: ${formatDate(note.updatedAt)}`,
    itemClass: "nav-note-item",
    onClick: () => openParentNote(note.id, parentFolderId)
  });
}

function createChildFolderButton(child) {
  return createNavListItem({
    icon: "📁",
    title: child.name,
    meta: `メモ ${countNotesInFolder(child.id)}`,
    actionText: "＞",
    onClick: () => openChildFolder(child.id)
  });
}

function createNavListItem({ icon, title, meta, actionText, itemClass, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `nav-list-item${itemClass ? ` ${itemClass}` : ""}`;
  button.addEventListener("click", onClick);

  if (icon) {
    const iconElement = document.createElement("span");
    iconElement.className = "nav-list-item-icon";
    iconElement.textContent = icon;
    iconElement.setAttribute("aria-hidden", "true");
    button.appendChild(iconElement);
  }

  const body = document.createElement("span");
  body.className = "nav-list-item-body";

  const titleElement = document.createElement("span");
  titleElement.className = "nav-list-item-title";
  titleElement.textContent = title;
  body.appendChild(titleElement);

  if (meta) {
    const metaElement = document.createElement("span");
    metaElement.className = "nav-list-item-meta";
    metaElement.textContent = meta;
    body.appendChild(metaElement);
  }

  button.appendChild(body);

  if (actionText) {
    const action = document.createElement("span");
    action.className = "nav-list-item-action";
    action.textContent = actionText;
    button.appendChild(action);
  }
  return button;
}

function createNavScreenHeader(backText, title, backAction) {
  const header = document.createElement("div");
  header.className = "nav-screen-header";

  if (backText && backAction) {
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "nav-back-button";
    backButton.textContent = `＜ ${backText}`;
    backButton.addEventListener("click", backAction);
    header.appendChild(backButton);
  }

  const titleElement = document.createElement("div");
  titleElement.className = "nav-screen-title";
  titleElement.textContent = title;
  header.appendChild(titleElement);
  return header;
}

function createNavEmptyMessage(message) {
  const item = document.createElement("div");
  item.className = "nav-empty-message";
  item.textContent = message;
  return item;
}

function openParentFolder(parentFolderId) {
  state.appView = "folders";
  state.folderNavLevel = "children";
  state.activeParentFolderId = parentFolderId;
  state.activeChildFolderId = null;
  state.selectedFolderId = parentFolderId;
  state.selectedNoteId = null;
  state.editorReturnView = null;
  appActions.renderAll();
}

function openParentNote(noteId, parentFolderId) {
  state.appView = "editor";
  state.folderNavLevel = "children";
  state.activeParentFolderId = parentFolderId;
  state.activeChildFolderId = null;
  state.selectedFolderId = parentFolderId;
  state.selectedNoteId = noteId;
  state.editorReturnView = null;
  state.editorMode = "preview";
  appActions.renderAll();
}

function openChildFolder(childFolderId) {
  const child = state.folders.find((folder) => folder.id === childFolderId);
  state.appView = "notes";
  state.folderNavLevel = "notes";
  state.activeParentFolderId = child ? child.parentId : state.activeParentFolderId;
  state.activeChildFolderId = childFolderId;
  state.selectedFolderId = childFolderId;
  state.selectedNoteId = null;
  state.editorReturnView = null;
  appActions.renderAll();
}

export function goToParentFolderList() {
  state.appView = "folders";
  state.folderNavLevel = "parents";
  state.activeParentFolderId = null;
  state.activeChildFolderId = null;
  state.selectedFolderId = null;
  state.selectedNoteId = null;
  state.editorReturnView = null;
  appActions.renderAll();
}

export function goBackFromNotes() {
  state.appView = "folders";
  state.folderNavLevel = "children";
  state.activeChildFolderId = null;
  state.selectedFolderId = state.activeParentFolderId;
  state.selectedNoteId = null;
  state.editorReturnView = null;
  appActions.renderAll();
}

function getActiveParentFolder() {
  return state.folders.find((folder) => folder.id === state.activeParentFolderId) || null;
}

function countNotesInFolder(folderId) {
  return state.notes.filter((note) => note.folderId === folderId).length;
}

function getNotesInFolder(folderId) {
  return state.notes
    .filter((note) => note.folderId === folderId)
    .sort((a, b) => {
      const pinDifference = Number(b.isPinned === true) - Number(a.isPinned === true);
      return pinDifference || b.updatedAt - a.updatedAt;
    });
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
