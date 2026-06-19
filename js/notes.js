"use strict";

import { collectAssetIdsFromNotes, deleteUnusedAssets } from "./assets.js";
import { createTextBlock, renderBlock, renderPreviewBlock } from "./blocks.js";
import { deleteNote, saveNote } from "./db.js";
import { getSelectedFolder } from "./folders.js";
import { AUTO_SAVE_DELAY, appActions, elements, state } from "./state.js";
import { createEmptyList, createId, formatDate } from "./utils.js";

export function createNoteObject(folderId) {
  const now = Date.now();
  return {
    id: createId("note"),
    folderId,
    title: "新規メモ",
    blocks: [createTextBlock("")],
    isPinned: false,
    createdAt: now,
    updatedAt: now
  };
}

export async function createNoteInSelectedFolder() {
  const selectedFolder = getSelectedFolder();
  if (!selectedFolder || !canCreateNoteInCurrentView(selectedFolder)) return;

  const note = createNoteObject(state.selectedFolderId);
  await saveNote(note);
  state.notes.push(note);
  state.selectedNoteId = note.id;
  state.appView = "editor";
  state.editorReturnView = null;
  state.editorMode = "edit";
  appActions.renderAll();
  elements.noteTitleInput.focus();
  elements.noteTitleInput.select();
}

export async function deleteNoteById(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return;
  const folder = state.folders.find((item) => item.id === note.folderId);
  const returnToParentContents = Boolean(
    folder &&
    !folder.parentId &&
    state.folderNavLevel === "children"
  );

  if (!confirm(`「${note.title || "無題"}」を削除します。よろしいですか？`)) return;

  const maybeUnusedAssetIds = collectAssetIdsFromNotes([note]);
  await deleteNote(noteId);
  state.notes = state.notes.filter((item) => item.id !== noteId);
  await deleteUnusedAssets(maybeUnusedAssetIds);

  if (state.selectedNoteId === noteId) {
    state.selectedNoteId = null;
    if (state.editorReturnView === "search") {
      state.appView = "search";
      state.editorReturnView = null;
    } else {
      state.appView = returnToParentContents ? "folders" : "notes";
    }
  }

  appActions.renderAll();
}

export async function deleteSelectedNote() {
  if (!state.selectedNoteId) return;
  await deleteNoteById(state.selectedNoteId);
}

export function renderNoteList() {
  elements.noteList.innerHTML = "";

  const selectedFolder = getSelectedFolder();
  if (state.folderNavLevel !== "notes") {
    elements.selectedFolderName.textContent = "メモ一覧";
    elements.noteList.appendChild(createEmptyList("フォルダを開くと、この場所にメモ一覧が表示されます。"));
    return;
  }

  elements.selectedFolderName.textContent = selectedFolder ? selectedFolder.name : "未選択";

  const folderNotes = getNotesInSelectedFolder();
  if (folderNotes.length === 0) {
    elements.noteList.appendChild(createEmptyList("このフォルダにはまだメモがありません。"));
    return;
  }

  folderNotes.forEach((note) => {
    const noteItem = document.createElement("article");
    noteItem.className = `note-card${note.id === state.selectedNoteId ? " selected" : ""}`;

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "note-item";
    selectButton.addEventListener("click", () => {
      state.selectedNoteId = note.id;
      state.appView = "editor";
      state.editorReturnView = null;
      state.editorMode = "preview";
      appActions.renderAll();
    });

    const icon = document.createElement("span");
    icon.className = "note-item-icon";
    icon.textContent = note.isPinned === true ? "📌 📝" : "📝";
    icon.setAttribute("aria-hidden", "true");

    const body = document.createElement("span");
    body.className = "note-item-body";

    const title = document.createElement("span");
    title.className = "note-title";
    title.textContent = note.title || "無題";

    const date = document.createElement("span");
    date.className = "note-date";
    date.textContent = formatDate(note.updatedAt);

    body.append(title, date);
    selectButton.append(icon, body);
    noteItem.append(selectButton);
    elements.noteList.appendChild(noteItem);
  });
}

export function renderEditor() {
  const note = getSelectedNote();
  state.isLoadingEditor = true;

  if (!note) {
    elements.emptyEditorMessage.classList.remove("hidden");
    elements.editorModeSwitch.classList.add("hidden");
    elements.noteActions.classList.add("hidden");
    elements.previewArea.classList.add("hidden");
    elements.editorForm.classList.add("hidden");
    elements.noteTitleInput.value = "";
    elements.blockList.innerHTML = "";
    setSaveStatus("保存済み");
    state.isLoadingEditor = false;
    return;
  }

  elements.emptyEditorMessage.classList.add("hidden");
  elements.editorModeSwitch.classList.remove("hidden");
  elements.noteActions.classList.remove("hidden");
  elements.togglePinButton.textContent = note.isPinned === true
    ? "★ お気に入り解除"
    : "☆ お気に入り";
  renderEditorModeSwitch();
  if (state.editorMode === "edit") {
    renderEditMode(note);
  } else {
    renderPreviewMode(note);
  }
  setSaveStatus("保存済み");
  state.isLoadingEditor = false;
}

export function renderEditorModeSwitch() {
  const isPreview = state.editorMode === "preview";
  elements.previewModeButton.classList.toggle("active-mode", isPreview);
  elements.editModeButton.classList.toggle("active-mode", !isPreview);
}

export function renderEditMode(note) {
  elements.previewArea.classList.add("hidden");
  elements.editorForm.classList.remove("hidden");
  elements.noteTitleInput.value = note.title;
  renderBlockList(note);
}

export function renderPreviewMode(note) {
  elements.editorForm.classList.add("hidden");
  elements.previewArea.classList.remove("hidden");
  elements.previewArea.innerHTML = "";

  const content = document.createElement("article");
  content.className = "preview-content";

  const title = document.createElement("h2");
  title.className = "preview-title";
  title.textContent = note.title || "無題";
  content.appendChild(title);

  note.blocks.forEach((block) => {
    content.appendChild(renderPreviewBlock(block));
  });

  elements.previewArea.appendChild(content);
}

export function renderBlockList(note) {
  elements.blockList.innerHTML = "";

  if (note.blocks.length === 0) {
    elements.blockList.appendChild(createEmptyList("本文ブロックがありません。"));
    return;
  }

  note.blocks.forEach((block, index) => {
    elements.blockList.appendChild(renderBlock(block, index, note.blocks.length));
  });
}

export function getSelectedNote() {
  return state.notes.find((note) => note.id === state.selectedNoteId) || null;
}

export function getNotesInSelectedFolder() {
  return state.notes
    .filter((note) => note.folderId === state.selectedFolderId)
    .sort(compareNotes);
}

export async function toggleSelectedNotePin() {
  const note = getSelectedNote();
  if (!note) return;

  note.isPinned = note.isPinned !== true;
  note.updatedAt = Date.now();
  await saveNote(note);
  appActions.renderAll();
}

export function scheduleAutoSave() {
  const note = getSelectedNote();
  if (!note) return;

  const noteId = note.id;
  setSaveStatus("保存中...", "saving");
  window.clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = window.setTimeout(() => {
    saveCurrentNote(noteId);
  }, AUTO_SAVE_DELAY);
}

export async function saveCurrentNote(noteId = state.selectedNoteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return;

  try {
    note.updatedAt = Date.now();
    await saveNote(note);
    if (note.id === state.selectedNoteId) {
      setSaveStatus("保存済み");
    }
    renderNoteList();
  } catch (error) {
    console.error(error);
    if (note.id === state.selectedNoteId) {
      setSaveStatus("保存エラー", "error");
    }
  }
}

export function setSaveStatus(text, stateClass) {
  elements.saveStatus.textContent = text;
  elements.saveStatus.classList.remove("saving", "error");
  if (stateClass) {
    elements.saveStatus.classList.add(stateClass);
  }
}

export function updateActionButtons() {
  const selectedFolder = getSelectedFolder();
  const hasFolder = Boolean(selectedFolder);
  const canAddChild = Boolean(state.activeParentFolderId);
  const hasNote = Boolean(getSelectedNote());
  const canCreateNote = hasFolder && canCreateNoteInCurrentView(selectedFolder);

  elements.addChildFolderButton.disabled = !canAddChild;
  elements.renameFolderButton.disabled = !hasFolder;
  elements.deleteFolderButton.disabled = !hasFolder;
  elements.addNoteButton.disabled = !canCreateNote;
  elements.deleteSelectedNoteButton.disabled = !hasNote;
  elements.togglePinButton.disabled = !hasNote;
  elements.moveNoteButton.disabled = !hasNote;
  elements.addTextBlockButton.disabled = !hasNote;
  elements.addImageBlockButton.disabled = !hasNote;
  elements.addDrawingBlockButton.disabled = !hasNote;
}

function canCreateNoteInCurrentView(selectedFolder) {
  if (state.folderNavLevel === "notes") {
    return true;
  }

  return Boolean(
    state.appView === "folders" &&
    state.folderNavLevel === "children" &&
    !selectedFolder.parentId &&
    selectedFolder.id === state.activeParentFolderId
  );
}

function compareNotes(a, b) {
  const pinDifference = Number(b.isPinned === true) - Number(a.isPinned === true);
  return pinDifference || b.updatedAt - a.updatedAt;
}
