"use strict";

import { handleBackupFileSelected, exportBackup } from "./js/backup.js";
import { addMzMessageBlock, addTextBlock } from "./js/blocks.js";
import { setupImageCropModal } from "./js/cropImage.js";
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
  goBackFromNotes,
  goToParentFolderList,
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
  closeMoveNoteModal,
  openMoveNoteModal
} from "./js/moveNotes.js";
import {
  closeReusableImageModal,
  handleReusableImageFileSelected,
  openReusableImageModal,
  registerReusableImage
} from "./js/reusableImages.js";
import {
  initializeMzDisplayMode,
  initializeTheme,
  renderMzTextPreviewButton,
  renderThemeButton,
  toggleSelectedNoteMzTextPreview,
  toggleTheme,
  updateApp
} from "./js/options.js";
import {
  createNoteInSelectedFolder,
  deleteSelectedNote,
  renderEditor,
  renderNoteList,
  scheduleAutoSave,
  toggleSelectedNotePin,
  updateActionButtons
} from "./js/notes.js";
import {
  closeSearchView,
  handleSearchInput,
  openSearchView,
  renderSearchView
} from "./js/search.js";
import {
  CONTROL_PANEL_STORAGE_KEY,
  DRAWING_SIZES,
  elements,
  setRenderAllAction,
  state
} from "./js/state.js";

const MENU_TOGGLE_GUARD_MS = 300;
let lastAddPanelToggleAt = 0;
let lastControlPanelToggleAt = 0;

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  collectElements();
  initializeTheme();
  initializeMzDisplayMode();
  initializeControlPanelState();
  registerEventListeners();
  setRenderAllAction(renderAll);

  await openDB();
  await loadData();
  await ensureInitialFolder();
  selectInitialFolder();
  renderAll();
}

function collectElements() {
  elements.folderPanel = document.querySelector(".folder-column");
  elements.noteListPanel = document.querySelector(".note-list-column");
  elements.searchPanel = document.querySelector(".search-column");
  elements.editorPanel = document.querySelector(".editor-column");
  elements.folderList = document.getElementById("folderList");
  elements.noteList = document.getElementById("noteList");
  elements.selectedFolderName = document.getElementById("selectedFolderName");
  elements.screenBackButton = document.getElementById("screenBackButton");
  elements.screenHeaderTitle = document.getElementById("screenHeaderTitle");
  elements.addPanelToggle = document.getElementById("addPanelToggle");
  elements.addPanel = document.getElementById("addPanel");
  elements.controlPanelToggle = document.getElementById("controlPanelToggle");
  elements.controlPanel = document.getElementById("controlPanel");
  elements.openSearchButton = document.getElementById("openSearchButton");
  elements.searchInput = document.getElementById("searchInput");
  elements.searchResults = document.getElementById("searchResults");
  elements.addParentFolderButton = document.getElementById("addParentFolderButton");
  elements.addChildFolderButton = document.getElementById("addChildFolderButton");
  elements.renameFolderButton = document.getElementById("renameFolderButton");
  elements.deleteFolderButton = document.getElementById("deleteFolderButton");
  elements.exportBackupButton = document.getElementById("exportBackupButton");
  elements.importBackupButton = document.getElementById("importBackupButton");
  elements.registerReusableImageButton = document.getElementById("registerReusableImageButton");
  elements.updateAppButton = document.getElementById("updateAppButton");
  elements.themeToggleButton = document.getElementById("themeToggleButton");
  elements.mzTextPreviewToggleButton = document.getElementById("mzTextPreviewToggleButton");
  elements.backupFileInput = document.getElementById("backupFileInput");
  elements.addNoteButton = document.getElementById("addNoteButton");
  elements.deleteSelectedNoteButton = document.getElementById("deleteSelectedNoteButton");
  elements.emptyEditorMessage = document.getElementById("emptyEditorMessage");
  elements.editorModeSwitch = document.getElementById("editorModeSwitch");
  elements.noteActions = document.getElementById("noteActions");
  elements.togglePinButton = document.getElementById("togglePinButton");
  elements.moveNoteButton = document.getElementById("moveNoteButton");
  elements.previewModeButton = document.getElementById("previewModeButton");
  elements.editModeButton = document.getElementById("editModeButton");
  elements.previewArea = document.getElementById("previewArea");
  elements.editorForm = document.getElementById("editorForm");
  elements.noteTitleInput = document.getElementById("noteTitleInput");
  elements.addTextBlockButton = document.getElementById("addTextBlockButton");
  elements.addMzMessageBlockButton = document.getElementById("addMzMessageBlockButton");
  elements.addImageBlockButton = document.getElementById("addImageBlockButton");
  elements.addReusableImageBlockButton = document.getElementById("addReusableImageBlockButton");
  elements.addDrawingBlockButton = document.getElementById("addDrawingBlockButton");
  elements.scrollToLastBlockButton = document.getElementById("scrollToLastBlockButton");
  elements.imageFileInput = document.getElementById("imageFileInput");
  elements.reusableImageFileInput = document.getElementById("reusableImageFileInput");
  elements.imageCropModal = document.getElementById("imageCropModal");
  elements.imageCropCloseButton = document.getElementById("imageCropCloseButton");
  elements.imageCropCanvas = document.getElementById("imageCropCanvas");
  elements.imageCropResetButton = document.getElementById("imageCropResetButton");
  elements.imageCropUseWholeButton = document.getElementById("imageCropUseWholeButton");
  elements.imageCropApplyButton = document.getElementById("imageCropApplyButton");
  elements.imageCropCancelButton = document.getElementById("imageCropCancelButton");
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
  elements.moveNoteModal = document.getElementById("moveNoteModal");
  elements.moveNoteModalCloseButton = document.getElementById("moveNoteModalCloseButton");
  elements.moveNoteFolderList = document.getElementById("moveNoteFolderList");
  elements.moveNoteCancelButton = document.getElementById("moveNoteCancelButton");
  elements.reusableImageModal = document.getElementById("reusableImageModal");
  elements.reusableImageModalCloseButton = document.getElementById("reusableImageModalCloseButton");
  elements.reusableImageList = document.getElementById("reusableImageList");
  elements.reusableImageModalCancelButton = document.getElementById("reusableImageModalCancelButton");
}

function registerEventListeners() {
  registerAddPanelToggle();
  registerControlPanelToggle();
  setupImageCropModal();
  elements.openSearchButton.addEventListener("click", () => runMenuAction(openSearchView));
  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.addParentFolderButton.addEventListener("click", () => runMenuAction(createParentFolder));
  elements.addChildFolderButton.addEventListener("click", () => runMenuAction(createChildFolder));
  elements.renameFolderButton.addEventListener("click", () => runMenuAction(renameSelectedFolder));
  elements.deleteFolderButton.addEventListener("click", () => runMenuAction(deleteSelectedFolder));
  elements.exportBackupButton.addEventListener("click", () => runMenuAction(exportBackup));
  elements.importBackupButton.addEventListener("click", () => runMenuAction(() => {
    elements.backupFileInput.value = "";
    elements.backupFileInput.click();
  }));
  elements.backupFileInput.addEventListener("change", handleBackupFileSelected);
  elements.registerReusableImageButton.addEventListener("click", () => runMenuAction(registerReusableImage));
  elements.updateAppButton.addEventListener("click", () => runMenuAction(updateApp));
  elements.themeToggleButton.addEventListener("click", () => runMenuAction(toggleTheme));
  elements.mzTextPreviewToggleButton.addEventListener("click", () => runMenuAction(toggleSelectedNoteMzTextPreview));
  elements.addNoteButton.addEventListener("click", () => runMenuAction(createNoteInSelectedFolder));
  elements.deleteSelectedNoteButton.addEventListener("click", () => runMenuAction(deleteSelectedNote));
  elements.screenBackButton.addEventListener("click", handleScreenBack);
  elements.togglePinButton.addEventListener("click", toggleSelectedNotePin);
  elements.moveNoteButton.addEventListener("click", openMoveNoteModal);
  elements.previewModeButton.addEventListener("click", () => {
    state.editorMode = "preview";
    renderEditor();
  });
  elements.editModeButton.addEventListener("click", () => {
    state.editorMode = "edit";
    renderEditor();
  });
  elements.addTextBlockButton.addEventListener("click", () => runAddMenuAction(addTextBlock));
  elements.addMzMessageBlockButton.addEventListener("click", () => runAddMenuAction(addMzMessageBlock));
  elements.addImageBlockButton.addEventListener("click", () => runAddMenuAction(addImageBlock));
  elements.addReusableImageBlockButton.addEventListener("click", () => runAddMenuAction(openReusableImageModal));
  elements.addDrawingBlockButton.addEventListener("click", () => runAddMenuAction(addDrawingBlock));
  elements.scrollToLastBlockButton.addEventListener("click", () => runAddMenuAction(scrollToLastBlock));
  elements.imageFileInput.addEventListener("change", handleImageFileSelected);
  elements.reusableImageFileInput.addEventListener("change", handleReusableImageFileSelected);
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
  elements.moveNoteModalCloseButton.addEventListener("click", closeMoveNoteModal);
  elements.moveNoteCancelButton.addEventListener("click", closeMoveNoteModal);
  elements.moveNoteModal.addEventListener("click", (event) => {
    if (event.target === elements.moveNoteModal) {
      closeMoveNoteModal();
    }
  });
  elements.reusableImageModalCloseButton.addEventListener("click", closeReusableImageModal);
  elements.reusableImageModalCancelButton.addEventListener("click", closeReusableImageModal);
  elements.reusableImageModal.addEventListener("click", (event) => {
    if (event.target === elements.reusableImageModal) {
      closeReusableImageModal();
    }
  });
  document.addEventListener("pointerup", handleDocumentPointerUp, { passive: true });
  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("memo:openReusableImages", (event) => {
    openReusableImageModal({
      afterBlockId: event.detail?.afterBlockId || null
    });
  });

  elements.noteTitleInput.addEventListener("input", () => {
    if (state.isLoadingEditor) return;
    const note = state.notes.find((item) => item.id === state.selectedNoteId);
    if (!note) return;
    note.title = elements.noteTitleInput.value;
    scheduleAutoSave();
    renderNoteList();
  });
}

function registerAddPanelToggle() {
  if (!elements.addPanelToggle || !elements.addPanel) return;
  elements.addPanelToggle.addEventListener("pointerup", handleAddPanelToggle, { passive: false });
  elements.addPanelToggle.addEventListener("click", handleAddPanelToggle);
}

function handleAddPanelToggle(event) {
  event.preventDefault();
  event.stopPropagation();
  const now = Date.now();
  if (now - lastAddPanelToggleAt < MENU_TOGGLE_GUARD_MS) return;
  lastAddPanelToggleAt = now;
  setAddPanelOpen(!state.addPanelOpen);
}

function registerControlPanelToggle() {
  if (!elements.controlPanelToggle || !elements.controlPanel) return;
  elements.controlPanelToggle.addEventListener("pointerup", handleControlPanelToggle, { passive: false });
  elements.controlPanelToggle.addEventListener("click", handleControlPanelToggle);
}

function handleControlPanelToggle(event) {
  event.preventDefault();
  event.stopPropagation();
  const now = Date.now();
  if (now - lastControlPanelToggleAt < MENU_TOGGLE_GUARD_MS) return;
  lastControlPanelToggleAt = now;
  setControlPanelOpen(!state.controlPanelOpen);
}

function handleDocumentPointerUp(event) {
  closeMenusFromOutsideEvent(event);
}

function handleDocumentClick(event) {
  closeMenusFromOutsideEvent(event);
}

function closeMenusFromOutsideEvent(event) {
  if (!state.addPanelOpen && !state.controlPanelOpen) return;
  if (isInsideHeaderMenu(event.target)) return;

  if (state.addPanelOpen) {
    setAddPanelOpen(false);
  }
  if (state.controlPanelOpen) {
    setControlPanelOpen(false);
  }
}

function isInsideHeaderMenu(target) {
  return Boolean(
    target &&
    (
      elements.addPanelToggle?.contains(target) ||
      elements.addPanel?.contains(target) ||
      elements.controlPanelToggle?.contains(target) ||
      elements.controlPanel?.contains(target)
    )
  );
}

function initializeControlPanelState() {
  state.controlPanelOpen = false;
  state.addPanelOpen = false;
  localStorage.setItem(CONTROL_PANEL_STORAGE_KEY, "false");
  renderControlPanelState();
  renderAddPanelState();
}

function toggleControlPanel() {
  setControlPanelOpen(!state.controlPanelOpen);
}

function runMenuAction(action) {
  try {
    const result = action();
    if (result && typeof result.finally === "function") {
      return result.finally(closeControlPanelAfterAction);
    }
    closeControlPanelAfterAction();
    return result;
  } catch (error) {
    closeControlPanelAfterAction();
    throw error;
  }
}

function runAddMenuAction(action) {
  try {
    const result = action();
    if (result && typeof result.finally === "function") {
      return result.finally(closeAddPanelAfterAction);
    }
    closeAddPanelAfterAction();
    return result;
  } catch (error) {
    closeAddPanelAfterAction();
    throw error;
  }
}

function closeControlPanelAfterAction() {
  setControlPanelOpen(false);
}

function closeAddPanelAfterAction() {
  setAddPanelOpen(false);
}

function setControlPanelOpen(isOpen) {
  state.controlPanelOpen = isOpen;
  if (isOpen) {
    state.addPanelOpen = false;
    renderAddPanelState();
  }
  localStorage.setItem(CONTROL_PANEL_STORAGE_KEY, isOpen ? "true" : "false");
  renderControlPanelState();
}

function setAddPanelOpen(isOpen) {
  state.addPanelOpen = isOpen;
  if (isOpen) {
    state.controlPanelOpen = false;
    localStorage.setItem(CONTROL_PANEL_STORAGE_KEY, "false");
    renderControlPanelState();
  }
  renderAddPanelState();
}

function renderControlPanelState() {
  if (!elements.controlPanel || !elements.controlPanelToggle) return;
  elements.controlPanel.classList.toggle("collapsed", !state.controlPanelOpen);
  elements.controlPanelToggle.textContent = "⚙";
  elements.controlPanelToggle.setAttribute(
    "aria-label",
    state.controlPanelOpen ? "操作メニューを閉じる" : "操作メニューを開く"
  );
  elements.controlPanelToggle.setAttribute("aria-expanded", state.controlPanelOpen ? "true" : "false");
}

function renderAddPanelState() {
  if (!elements.addPanel || !elements.addPanelToggle) return;
  elements.addPanel.classList.toggle("collapsed", !state.addPanelOpen);
  elements.addPanelToggle.textContent = "＋";
  elements.addPanelToggle.setAttribute(
    "aria-label",
    state.addPanelOpen ? "追加メニューを閉じる" : "追加メニューを開く"
  );
  elements.addPanelToggle.setAttribute("aria-expanded", state.addPanelOpen ? "true" : "false");
}

function renderAll() {
  renderFolderList();
  renderNoteList();
  renderSearchView();
  renderEditor();
  updateActionButtons();
  renderThemeButton();
  renderMzTextPreviewButton();
  renderAppView();
  renderScreenHeader();
}

function scrollToLastBlock() {
  if (state.editorMode === "preview" && !elements.previewArea.classList.contains("hidden")) {
    const previewContent = elements.previewArea.querySelector(".preview-content");
    const lastPreviewBlock = previewContent?.lastElementChild || elements.previewArea.lastElementChild;
    if (lastPreviewBlock) {
      lastPreviewBlock.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
  }

  const lastBlock = elements.blockList.lastElementChild;
  if (lastBlock) {
    lastBlock.scrollIntoView({ behavior: "smooth", block: "end" });
    return;
  }

  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
}

function renderAppView() {
  elements.folderPanel.classList.toggle("hidden-screen", state.appView !== "folders");
  elements.noteListPanel.classList.toggle("hidden-screen", state.appView !== "notes");
  elements.searchPanel.classList.toggle("hidden-screen", state.appView !== "search");
  elements.editorPanel.classList.toggle("hidden-screen", state.appView !== "editor");
}

function renderScreenHeader() {
  const title = getScreenTitle();
  const backLabel = getScreenBackLabel();

  elements.screenHeaderTitle.textContent = title;
  elements.screenBackButton.textContent = backLabel || "";
  elements.screenBackButton.classList.toggle("hidden", !backLabel);
}

function handleScreenBack() {
  if (state.appView === "search") {
    closeSearchView();
    return;
  }

  if (state.appView === "editor") {
    if (state.editorReturnView === "search") {
      state.appView = "search";
      state.editorReturnView = null;
      renderAll();
      return;
    }

    state.appView = isParentFolderContentContext() ? "folders" : "notes";
    renderAll();
    return;
  }

  if (state.appView === "notes" || state.folderNavLevel === "notes") {
    goBackFromNotes();
    return;
  }

  if (state.folderNavLevel === "children") {
    goToParentFolderList();
  }
}

function getScreenTitle() {
  if (state.appView === "search") {
    return "検索";
  }

  if (state.appView === "editor") {
    const note = state.notes.find((item) => item.id === state.selectedNoteId);
    return note ? (note.title || "無題") : "メモ";
  }

  if (state.appView === "notes") {
    const folder = state.folders.find((item) => item.id === state.selectedFolderId);
    return folder ? folder.name : "メモ一覧";
  }

  if (state.folderNavLevel === "children") {
    const parent = state.folders.find((item) => item.id === state.activeParentFolderId);
    return parent ? parent.name : "子フォルダ";
  }

  return "親フォルダ";
}

function getScreenBackLabel() {
  if (state.appView === "search") {
    return "＜ 戻る";
  }

  if (state.appView === "editor") {
    if (state.editorReturnView === "search") {
      return "＜ 検索結果へ戻る";
    }

    return isParentFolderContentContext()
      ? "＜ 親フォルダへ戻る"
      : "＜ メモ一覧へ戻る";
  }

  if (state.appView === "notes" || state.folderNavLevel === "notes") {
    return "＜ 子フォルダへ戻る";
  }

  if (state.folderNavLevel === "children") {
    return "＜ 親フォルダへ戻る";
  }

  return "";
}

function isParentFolderContentContext() {
  const folder = state.folders.find((item) => item.id === state.selectedFolderId);
  return Boolean(
    folder &&
    !folder.parentId &&
    state.folderNavLevel === "children"
  );
}
