"use strict";

import { saveNote } from "./db.js";
import { appActions, elements, state } from "./state.js";

export function openMoveNoteModal() {
  const note = getSelectedNote();
  if (!note) return;

  renderMoveDestinations(note);
  elements.moveNoteModal.classList.remove("hidden");
  elements.moveNoteModal.setAttribute("aria-hidden", "false");
}

export function closeMoveNoteModal() {
  elements.moveNoteModal.classList.add("hidden");
  elements.moveNoteModal.setAttribute("aria-hidden", "true");
  elements.moveNoteFolderList.innerHTML = "";
}

function renderMoveDestinations(note) {
  elements.moveNoteFolderList.innerHTML = "";
  const parents = state.folders
    .filter((folder) => !folder.parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  parents.forEach((parent) => {
    elements.moveNoteFolderList.appendChild(createDestinationButton(parent, note.folderId, false));

    state.folders
      .filter((folder) => folder.parentId === parent.id)
      .sort((a, b) => a.name.localeCompare(b.name, "ja"))
      .forEach((child) => {
        elements.moveNoteFolderList.appendChild(createDestinationButton(child, note.folderId, true));
      });
  });
}

function createDestinationButton(folder, currentFolderId, isChild) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `move-note-destination${isChild ? " child-destination" : ""}`;
  button.disabled = folder.id === currentFolderId;
  button.addEventListener("click", () => moveSelectedNoteToFolder(folder.id));

  const icon = document.createElement("span");
  icon.className = "move-note-destination-icon";
  icon.textContent = "📁";
  icon.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "move-note-destination-name";
  name.textContent = folder.name;

  button.append(icon, name);

  if (folder.id === currentFolderId) {
    const current = document.createElement("span");
    current.className = "move-note-current-label";
    current.textContent = "現在";
    button.appendChild(current);
  }

  return button;
}

async function moveSelectedNoteToFolder(folderId) {
  const note = getSelectedNote();
  const folder = state.folders.find((item) => item.id === folderId);
  if (!note || !folder || note.folderId === folder.id) return;

  if (!confirm(`このメモを「${folder.name}」へ移動しますか？`)) return;

  note.folderId = folder.id;
  note.updatedAt = Date.now();
  await saveNote(note);

  state.selectedFolderId = folder.id;
  state.selectedNoteId = note.id;
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

  closeMoveNoteModal();
  appActions.renderAll();
}

function getSelectedNote() {
  return state.notes.find((note) => note.id === state.selectedNoteId) || null;
}
