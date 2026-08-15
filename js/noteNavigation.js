"use strict";

import { appActions, state } from "./state.js";

export function openNoteById(noteId, options = {}) {
  const note = state.notes.find((item) => item.id === noteId);
  return openNote(note, options);
}

export function openNote(note, options = {}) {
  if (!note) return false;

  const folder = state.folders.find((item) => item.id === note.folderId);
  if (!folder) return false;

  state.selectedFolderId = folder.id;
  state.selectedNoteId = note.id;
  state.editorMode = "preview";
  state.editorReturnView = options.editorReturnView || null;
  state.appView = "editor";

  if (options.clearSearchReturnState) {
    state.searchReturnState = null;
  }

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
  return true;
}

export function getFolderPath(folderId) {
  const folder = state.folders.find((item) => item.id === folderId);
  if (!folder) return "不明なフォルダ";
  if (!folder.parentId) return folder.name;

  const parent = state.folders.find((item) => item.id === folder.parentId);
  return parent ? `${parent.name} / ${folder.name}` : folder.name;
}
