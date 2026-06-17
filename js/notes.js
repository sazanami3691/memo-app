"use strict";

import { collectAssetIdsFromNotes, deleteUnusedAssets } from "./assets.js";
import { createTextBlock, renderBlock, renderPreviewBlock } from "./blocks.js";
import { deleteNote, saveNote } from "./db.js";
import { getSelectedFolder } from "./folders.js";
import { AUTO_SAVE_DELAY, elements, state } from "./state.js";
import { createEmptyList, createId, formatDate } from "./utils.js";

export function createNoteObject(folderId) {
  const now = Date.now();
  return {
    id: createId("note"),
    folderId,
    title: "新規メモ",
    blocks: [createTextBlock("")],
    createdAt: now,
    updatedAt: now
  };
}

export async function createNoteInSelectedFolder() {
  if (!state.selectedFolderId) return;

  const note = createNoteObject(state.selectedFolderId);
  await saveNote(note);
  state.notes.push(note);
  state.selectedNoteId = note.id;
  state.editorMode = "edit";
  renderNoteList();
  renderEditor();
  updateActionButtons();
  elements.noteTitleInput.focus();
  elements.noteTitleInput.select();
}

export async function deleteNoteById(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return;

  if (!confirm(`「${note.title || "無題"}」を削除します。よろしいですか？`)) return;

  const maybeUnusedAssetIds = collectAssetIdsFromNotes([note]);
  await deleteNote(noteId);
  state.notes = state.notes.filter((item) => item.id !== noteId);
  await deleteUnusedAssets(maybeUnusedAssetIds);

  if (state.selectedNoteId === noteId) {
    state.selectedNoteId = null;
  }

  renderNoteList();
  renderEditor();
  updateActionButtons();
}

export async function deleteSelectedNote() {
  if (!state.selectedNoteId) return;
  await deleteNoteById(state.selectedNoteId);
}

export function renderNoteList() {
  elements.noteList.innerHTML = "";

  const selectedFolder = getSelectedFolder();
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
      state.editorMode = "preview";
      renderNoteList();
      renderEditor();
      updateActionButtons();
    });

    const title = document.createElement("span");
    title.className = "note-title";
    title.textContent = note.title || "無題";

    const date = document.createElement("span");
    date.className = "note-date";
    date.textContent = formatDate(note.updatedAt);

    selectButton.append(title, date);
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
    .sort((a, b) => b.updatedAt - a.updatedAt);
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
  const canAddChild = hasFolder && !selectedFolder.parentId;
  const hasNote = Boolean(getSelectedNote());

  elements.addChildFolderButton.disabled = !canAddChild;
  elements.renameFolderButton.disabled = !hasFolder;
  elements.deleteFolderButton.disabled = !hasFolder;
  elements.addNoteButton.disabled = !hasFolder;
  elements.deleteSelectedNoteButton.disabled = !hasNote;
  elements.addTextBlockButton.disabled = !hasNote;
  elements.addImageBlockButton.disabled = !hasNote;
  elements.addDrawingBlockButton.disabled = !hasNote;
}
