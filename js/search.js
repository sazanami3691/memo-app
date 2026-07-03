"use strict";

import { appActions, elements, state } from "./state.js";
import { formatDate } from "./utils.js";

export function openSearchView() {
  if (state.appView !== "search") {
    state.searchReturnState = captureCurrentView();
  }

  state.appView = "search";
  state.editorReturnView = null;
  appActions.renderAll();
  window.requestAnimationFrame(() => {
    elements.searchInput.focus();
  });
}

export function closeSearchView() {
  const previous = state.searchReturnState;
  state.searchReturnState = null;

  if (previous) {
    Object.assign(state, previous);
  } else {
    state.appView = "folders";
    state.folderNavLevel = "parents";
    state.activeParentFolderId = null;
    state.activeChildFolderId = null;
    state.selectedFolderId = null;
    state.selectedNoteId = null;
  }

  appActions.renderAll();
}

export function handleSearchInput() {
  state.searchQuery = elements.searchInput.value;
  renderSearchView();
}

export function renderSearchView() {
  if (elements.searchInput.value !== state.searchQuery) {
    elements.searchInput.value = state.searchQuery;
  }

  elements.searchResults.innerHTML = "";
  const query = normalizeSearchText(state.searchQuery);

  if (!query) {
    elements.searchResults.appendChild(createSearchMessage("検索キーワードを入力してください。"));
    return;
  }

  const folderResults = searchFolders(query);
  const noteResults = searchNotes(query);

  if (folderResults.length === 0 && noteResults.length === 0) {
    elements.searchResults.appendChild(createSearchMessage("一致するメモやフォルダがありません。"));
    return;
  }

  if (noteResults.length > 0) {
    elements.searchResults.appendChild(createResultSectionTitle(`メモ ${noteResults.length}件`));
    noteResults.forEach((result) => {
      elements.searchResults.appendChild(createNoteSearchResult(result));
    });
  }

  if (folderResults.length > 0) {
    elements.searchResults.appendChild(createResultSectionTitle(`フォルダ ${folderResults.length}件`));
    folderResults.forEach((folder) => {
      elements.searchResults.appendChild(createFolderSearchResult(folder));
    });
  }
}

function searchNotes(query) {
  return state.notes
    .map((note) => {
      const reasons = [];
      const folderPath = getFolderPath(note.folderId);

      if (normalizeSearchText(note.title).includes(query)) {
        reasons.push("タイトル一致");
      }

      const blocks = Array.isArray(note.blocks) ? note.blocks : [];
      const textMatched = blocks.some((block) => {
        return (block.type === "text" || block.type === "mzMessage") &&
          normalizeSearchText(block.text).includes(query);
      });
      if (textMatched) {
        reasons.push("本文一致");
      }

      const mzSpeakerMatched = blocks.some((block) => {
        return block.type === "mzMessage" && normalizeSearchText(block.speakerName).includes(query);
      });
      if (mzSpeakerMatched) {
        reasons.push("セリフ主一致");
      }

      const captionMatched = blocks.some((block) => {
        return (block.type === "image" || block.type === "drawing") &&
          normalizeSearchText(block.caption).includes(query);
      });
      if (captionMatched) {
        reasons.push("キャプション一致");
      }

      if (normalizeSearchText(folderPath).includes(query)) {
        reasons.push("フォルダ名一致");
      }

      return reasons.length > 0 ? { note, folderPath, reasons } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const pinDifference = Number(b.note.isPinned === true) - Number(a.note.isPinned === true);
      return pinDifference || b.note.updatedAt - a.note.updatedAt;
    });
}

function searchFolders(query) {
  return state.folders
    .filter((folder) => normalizeSearchText(folder.name).includes(query))
    .sort((a, b) => {
      const parentDifference = Number(Boolean(a.parentId)) - Number(Boolean(b.parentId));
      return parentDifference || a.name.localeCompare(b.name, "ja");
    });
}

function createNoteSearchResult({ note, folderPath, reasons }) {
  const icon = note.isPinned === true ? "📌 📝" : "📝";
  return createSearchResultButton({
    icon,
    title: note.title || "無題",
    meta: `${folderPath} / ${reasons.join("・")} / 更新: ${formatDate(note.updatedAt)}`,
    onClick: () => openNoteFromSearch(note)
  });
}

function createFolderSearchResult(folder) {
  return createSearchResultButton({
    icon: "📁",
    title: folder.name,
    meta: folder.parentId ? `子フォルダ / ${getFolderPath(folder.id)}` : "親フォルダ",
    actionText: "＞",
    onClick: () => openFolderFromSearch(folder)
  });
}

function createSearchResultButton({ icon, title, meta, actionText, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-result-item";
  button.addEventListener("click", onClick);

  const iconElement = document.createElement("span");
  iconElement.className = "search-result-icon";
  iconElement.textContent = icon;
  iconElement.setAttribute("aria-hidden", "true");

  const body = document.createElement("span");
  body.className = "search-result-body";

  const titleElement = document.createElement("span");
  titleElement.className = "search-result-title";
  titleElement.textContent = title;

  const metaElement = document.createElement("span");
  metaElement.className = "search-result-meta";
  metaElement.textContent = meta;
  body.append(titleElement, metaElement);

  button.append(iconElement, body);

  if (actionText) {
    const action = document.createElement("span");
    action.className = "search-result-action";
    action.textContent = actionText;
    button.appendChild(action);
  }

  return button;
}

function createResultSectionTitle(text) {
  const heading = document.createElement("h2");
  heading.className = "search-result-section-title";
  heading.textContent = text;
  return heading;
}

function createSearchMessage(text) {
  const message = document.createElement("div");
  message.className = "empty-list";
  message.textContent = text;
  return message;
}

function openNoteFromSearch(note) {
  const folder = state.folders.find((item) => item.id === note.folderId);
  if (!folder) return;

  state.selectedFolderId = folder.id;
  state.selectedNoteId = note.id;
  state.editorMode = "preview";
  state.editorReturnView = "search";
  state.appView = "editor";

  if (folder.parentId) {
    state.folderNavLevel = "notes";
    state.activeParentFolderId = folder.parentId;
    state.activeChildFolderId = folder.id;
  } else {
    state.folderNavLevel = "children";
    state.activeParentFolderId = folder.id;
    state.activeChildFolderId = null;
  }

  appActions.renderAll();
}

function openFolderFromSearch(folder) {
  state.searchReturnState = null;
  state.editorReturnView = null;
  state.selectedNoteId = null;
  state.selectedFolderId = folder.id;

  if (folder.parentId) {
    state.appView = "notes";
    state.folderNavLevel = "notes";
    state.activeParentFolderId = folder.parentId;
    state.activeChildFolderId = folder.id;
  } else {
    state.appView = "folders";
    state.folderNavLevel = "children";
    state.activeParentFolderId = folder.id;
    state.activeChildFolderId = null;
  }

  appActions.renderAll();
}

function getFolderPath(folderId) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return "不明なフォルダ";
  if (!folder.parentId) return folder.name;

  const parent = state.folders.find((item) => item.id === folder.parentId);
  return parent ? `${parent.name} / ${folder.name}` : folder.name;
}

function normalizeSearchText(value) {
  return String(value || "").toLocaleLowerCase().trim();
}

function captureCurrentView() {
  return {
    appView: state.appView,
    folderNavLevel: state.folderNavLevel,
    activeParentFolderId: state.activeParentFolderId,
    activeChildFolderId: state.activeChildFolderId,
    selectedFolderId: state.selectedFolderId,
    selectedNoteId: state.selectedNoteId,
    editorMode: state.editorMode,
    editorReturnView: state.editorReturnView
  };
}
