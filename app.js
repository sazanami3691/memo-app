"use strict";

import { handleBackupFileSelected, exportBackup } from "./js/backup.js";
import { addTextBlock } from "./js/blocks.js";
import { openDB, loadData } from "./js/db.js";
import {
  closeDrawingModal,
  continueDrawing,
  endDrawing,
  redoDrawing,
  saveDrawingFromCanvas,
  setDrawingMode,
  setDrawingSize,
  startDrawing,
  undoDrawing,
  clearDrawingCanvas,
  addDrawingBlock
} from "./js/drawingBlocks.js";
import {
  createChildFolder,
  createParentFolder,
  deleteSelectedFolder,
  ensureInitialFolder,
  renameSelectedFolder,
  renderFolderList,
  selectInitialFolder
} from "./js/folders.js";
import {
  addImageBlock,
  closeImageModal,
  handleImageFileSelected
} from "./js/imageBlocks.js";
import {
  createNoteInSelectedFolder,
  renderEditor,
  renderNoteList,
  scheduleAutoSave,
  updateActionButtons
} from "./js/notes.js";
import { DRAWING_SIZES, elements, setRenderAllAction, state } from "./js/state.js";

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  collectElements();
  registerEventListeners();
  setRenderAllAction(renderAll);

  await openDB();
  await loadData();
  await ensureInitialFolder();
  selectInitialFolder();
  renderAll();
}

function collectElements() {
  elements.folderList = document.getElementById("folderList");
  elements.noteList = document.getElementById("noteList");
  elements.selectedFolderName = document.getElementById("selectedFolderName");
  elements.addParentFolderButton = document.getElementById("addParentFolderButton");
  elements.addChildFolderButton = document.getElementById("addChildFolderButton");
  elements.renameFolderButton = document.getElementById("renameFolderButton");
  elements.deleteFolderButton = document.getElementById("deleteFolderButton");
  elements.exportBackupButton = document.getElementById("exportBackupButton");
  elements.importBackupButton = document.getElementById("importBackupButton");
  elements.backupFileInput = document.getElementById("backupFileInput");
  elements.addNoteButton = document.getElementById("addNoteButton");
  elements.emptyEditorMessage = document.getElementById("emptyEditorMessage");
  elements.editorModeSwitch = document.getElementById("editorModeSwitch");
  elements.previewModeButton = document.getElementById("previewModeButton");
  elements.editModeButton = document.getElementById("editModeButton");
  elements.previewArea = document.getElementById("previewArea");
  elements.editorForm = document.getElementById("editorForm");
  elements.noteTitleInput = document.getElementById("noteTitleInput");
  elements.addTextBlockButton = document.getElementById("addTextBlockButton");
  elements.addImageBlockButton = document.getElementById("addImageBlockButton");
  elements.addDrawingBlockButton = document.getElementById("addDrawingBlockButton");
  elements.imageFileInput = document.getElementById("imageFileInput");
  elements.blockList = document.getElementById("blockList");
  elements.saveStatus = document.getElementById("saveStatus");
  elements.imageModal = document.getElementById("imageModal");
  elements.imageModalImage = document.getElementById("imageModalImage");
  elements.imageModalClose = document.getElementById("imageModalClose");
  elements.drawingModal = document.getElementById("drawingModal");
  elements.drawingModalCloseButton = document.getElementById("drawingModalCloseButton");
  elements.drawingPenButton = document.getElementById("drawingPenButton");
  elements.drawingEraserButton = document.getElementById("drawingEraserButton");
  elements.drawingSizeSmallButton = document.getElementById("drawingSizeSmallButton");
  elements.drawingSizeMediumButton = document.getElementById("drawingSizeMediumButton");
  elements.drawingSizeLargeButton = document.getElementById("drawingSizeLargeButton");
  elements.drawingUndoButton = document.getElementById("drawingUndoButton");
  elements.drawingRedoButton = document.getElementById("drawingRedoButton");
  elements.drawingClearButton = document.getElementById("drawingClearButton");
  elements.drawingCanvas = document.getElementById("drawingCanvas");
  elements.drawingSaveButton = document.getElementById("drawingSaveButton");
  elements.drawingCancelButton = document.getElementById("drawingCancelButton");
}

function registerEventListeners() {
  elements.addParentFolderButton.addEventListener("click", createParentFolder);
  elements.addChildFolderButton.addEventListener("click", createChildFolder);
  elements.renameFolderButton.addEventListener("click", renameSelectedFolder);
  elements.deleteFolderButton.addEventListener("click", deleteSelectedFolder);
  elements.exportBackupButton.addEventListener("click", exportBackup);
  elements.importBackupButton.addEventListener("click", () => {
    elements.backupFileInput.value = "";
    elements.backupFileInput.click();
  });
  elements.backupFileInput.addEventListener("change", handleBackupFileSelected);
  elements.addNoteButton.addEventListener("click", createNoteInSelectedFolder);
  elements.previewModeButton.addEventListener("click", () => {
    state.editorMode = "preview";
    renderEditor();
  });
  elements.editModeButton.addEventListener("click", () => {
    state.editorMode = "edit";
    renderEditor();
  });
  elements.addTextBlockButton.addEventListener("click", addTextBlock);
  elements.addImageBlockButton.addEventListener("click", addImageBlock);
  elements.addDrawingBlockButton.addEventListener("click", addDrawingBlock);
  elements.imageFileInput.addEventListener("change", handleImageFileSelected);
  elements.imageModalClose.addEventListener("click", closeImageModal);
  elements.imageModal.addEventListener("click", (event) => {
    if (event.target === elements.imageModal) {
      closeImageModal();
    }
  });
  elements.drawingModalCloseButton.addEventListener("click", closeDrawingModal);
  elements.drawingCancelButton.addEventListener("click", closeDrawingModal);
  elements.drawingPenButton.addEventListener("click", () => setDrawingMode("pen"));
  elements.drawingEraserButton.addEventListener("click", () => setDrawingMode("eraser"));
  elements.drawingSizeSmallButton.addEventListener("click", () => setDrawingSize(DRAWING_SIZES.small));
  elements.drawingSizeMediumButton.addEventListener("click", () => setDrawingSize(DRAWING_SIZES.medium));
  elements.drawingSizeLargeButton.addEventListener("click", () => setDrawingSize(DRAWING_SIZES.large));
  elements.drawingUndoButton.addEventListener("click", undoDrawing);
  elements.drawingRedoButton.addEventListener("click", redoDrawing);
  elements.drawingClearButton.addEventListener("click", clearDrawingCanvas);
  elements.drawingSaveButton.addEventListener("click", saveDrawingFromCanvas);
  elements.drawingCanvas.addEventListener("pointerdown", startDrawing);
  elements.drawingCanvas.addEventListener("pointermove", continueDrawing);
  elements.drawingCanvas.addEventListener("pointerup", endDrawing);
  elements.drawingCanvas.addEventListener("pointercancel", endDrawing);
  elements.drawingCanvas.addEventListener("pointerleave", endDrawing);

  elements.noteTitleInput.addEventListener("input", () => {
    if (state.isLoadingEditor) return;
    const note = state.notes.find((item) => item.id === state.selectedNoteId);
    if (!note) return;
    note.title = elements.noteTitleInput.value;
    scheduleAutoSave();
    renderNoteList();
  });
}

function renderAll() {
  renderFolderList();
  renderNoteList();
  renderEditor();
  updateActionButtons();
}
