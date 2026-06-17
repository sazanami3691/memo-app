"use strict";

const DB_NAME = "local_memo_app_phase1";
const DB_VERSION = 2;
const STORE_FOLDERS = "folders";
const STORE_NOTES = "notes";
const STORE_ASSETS = "assets";
const AUTO_SAVE_DELAY = 400;
const BACKUP_APP_NAME = "Local Memo Binder";
const BACKUP_VERSION = 1;
const IMAGE_MAX_SIZE = 1200;
const IMAGE_JPEG_QUALITY = 0.82;
const DRAWING_WIDTH = 1200;
const DRAWING_HEIGHT = 800;
const DRAWING_SIZES = {
  small: 3,
  medium: 8,
  large: 16
};

let db = null;
let folders = [];
let notes = [];
let assets = [];
let selectedFolderId = null;
let selectedNoteId = null;
let autoSaveTimer = null;
let isLoadingEditor = false;
let pendingImageInsertAfterBlockId = null;
let pendingDrawingInsertAfterBlockId = null;
let editingDrawingAssetId = null;
let drawingContext = null;
let drawingMode = "pen";
let drawingSize = DRAWING_SIZES.medium;
let drawingStrokes = [];
let drawingRedoStack = [];
let currentDrawingStroke = null;
let isDrawing = false;
let baseDrawingDataUrl = null;

const elements = {};

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  collectElements();
  registerEventListeners();

  db = await openDB();
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
    if (isLoadingEditor) return;
    const note = getSelectedNote();
    if (!note) return;
    note.title = elements.noteTitleInput.value;
    scheduleAutoSave();
    renderNoteList();
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_FOLDERS)) {
        database.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(STORE_NOTES)) {
        database.createObjectStore(STORE_NOTES, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(STORE_ASSETS)) {
        database.createObjectStore(STORE_ASSETS, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFolders() {
  return getAllFromStore(STORE_FOLDERS);
}

function saveFolder(folder) {
  return putToStore(STORE_FOLDERS, folder);
}

function deleteFolder(folderId) {
  return deleteFromStore(STORE_FOLDERS, folderId);
}

function getAllNotes() {
  return getAllFromStore(STORE_NOTES);
}

function saveNote(note) {
  return putToStore(STORE_NOTES, note);
}

function deleteNote(noteId) {
  return deleteFromStore(STORE_NOTES, noteId);
}

function getAllAssets() {
  return getAllFromStore(STORE_ASSETS);
}

function saveAsset(asset) {
  return putToStore(STORE_ASSETS, asset);
}

function deleteAsset(assetId) {
  return deleteFromStore(STORE_ASSETS, assetId);
}

function getAllFromStore(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putToStore(storeName, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(value);

    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function deleteFromStore(storeName, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearAllData() {
  await clearStore(STORE_FOLDERS);
  await clearStore(STORE_NOTES);
  await clearStore(STORE_ASSETS);
}

async function restoreBackupData(backupData) {
  await clearAllData();

  for (const folder of backupData.folders) {
    await saveFolder(folder);
  }

  for (const note of backupData.notes) {
    await saveNote(note);
  }

  for (const asset of backupData.assets) {
    await saveAsset(asset);
  }
}

async function loadData() {
  folders = await getAllFolders();
  notes = await getAllNotes();
  assets = await getAllAssets();
  normalizeLoadedNotes();
}

async function ensureInitialFolder() {
  if (folders.length > 0) return;

  const folder = createFolderObject("未分類", null);
  await saveFolder(folder);
  folders.push(folder);
}

function selectInitialFolder() {
  const sortedFolders = getSortedFolders();
  selectedFolderId = sortedFolders[0] ? sortedFolders[0].id : null;
}

function createFolderObject(name, parentId) {
  const now = Date.now();
  return {
    id: createId("folder"),
    parentId,
    name,
    createdAt: now,
    updatedAt: now
  };
}

function createNoteObject(folderId) {
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

function normalizeLoadedNotes() {
  notes.forEach((note) => {
    if (!Array.isArray(note.blocks)) {
      note.blocks = [];
    }
  });
}

function createTextBlock(text) {
  return {
    id: createId("block"),
    type: "text",
    text
  };
}

function createImageBlock(assetId) {
  return {
    id: createId("block"),
    type: "image",
    assetId,
    caption: ""
  };
}

function createDrawingBlock(assetId) {
  return {
    id: createId("block"),
    type: "drawing",
    assetId,
    caption: ""
  };
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createParentFolder() {
  const name = prompt("親フォルダ名を入力してください");
  const cleanName = normalizeName(name);
  if (!cleanName) return;

  const folder = createFolderObject(cleanName, null);
  await saveFolder(folder);
  folders.push(folder);
  selectedFolderId = folder.id;
  selectedNoteId = null;
  renderAll();
}

async function createChildFolder() {
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
  folders.push(folder);
  selectedFolderId = folder.id;
  selectedNoteId = null;
  renderAll();
}

function getFolderForChildCreation() {
  const selectedFolder = getSelectedFolder();
  if (!selectedFolder) return null;
  return selectedFolder.parentId ? null : selectedFolder;
}

async function renameSelectedFolder() {
  const folder = getSelectedFolder();
  if (!folder) return;

  const name = prompt("新しいフォルダ名を入力してください", folder.name);
  const cleanName = normalizeName(name);
  if (!cleanName) return;

  folder.name = cleanName;
  folder.updatedAt = Date.now();
  await saveFolder(folder);
  renderAll();
}

async function deleteSelectedFolder() {
  const folder = getSelectedFolder();
  if (!folder) return;

  const targetFolderIds = getDescendantFolderIds(folder.id);
  targetFolderIds.unshift(folder.id);
  const targetNotes = notes.filter((note) => targetFolderIds.includes(note.folderId));
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

  notes = notes.filter((note) => !targetNoteIds.includes(note.id));
  folders = folders.filter((item) => !targetFolderIds.includes(item.id));
  await deleteUnusedAssets(maybeUnusedAssetIds);

  selectedNoteId = null;
  selectedFolderId = folders[0] ? getSortedFolders()[0].id : null;

  if (folders.length === 0) {
    await ensureInitialFolder();
    selectedFolderId = folders[0].id;
  }

  renderAll();
}

async function createNoteInSelectedFolder() {
  if (!selectedFolderId) return;

  const note = createNoteObject(selectedFolderId);
  await saveNote(note);
  notes.push(note);
  selectedNoteId = note.id;
  renderAll();
  elements.noteTitleInput.focus();
  elements.noteTitleInput.select();
}

async function deleteNoteById(noteId) {
  const note = notes.find((item) => item.id === noteId);
  if (!note) return;

  if (!confirm(`「${note.title || "無題"}」を削除します。よろしいですか？`)) return;

  const maybeUnusedAssetIds = collectAssetIdsFromNotes([note]);
  await deleteNote(noteId);
  notes = notes.filter((item) => item.id !== noteId);
  await deleteUnusedAssets(maybeUnusedAssetIds);

  if (selectedNoteId === noteId) {
    selectedNoteId = null;
  }

  renderAll();
}

async function exportBackup() {
  try {
    const backup = {
      appName: BACKUP_APP_NAME,
      backupVersion: BACKUP_VERSION,
      exportedAt: Date.now(),
      data: {
        folders: await getAllFolders(),
        notes: await getAllNotes(),
        assets: await getAllAssets()
      }
    };

    const jsonText = JSON.stringify(backup, null, 2);
    downloadJsonFile(jsonText, createBackupFileName());
  } catch (error) {
    console.error(error);
    alert("バックアップの書き出しに失敗しました。");
  }
}

async function handleBackupFileSelected() {
  const file = elements.backupFileInput.files[0];
  if (!file) return;

  try {
    const backup = await importBackupFile(file);
    validateBackupData(backup);

    const ok = confirm(
      "現在のメモ、画像、手書きデータをすべて削除して、バックアップ内容で上書き復元します。\n" +
      "この操作は取り消せません。\n" +
      "復元してよろしいですか？"
    );
    if (!ok) return;

    window.clearTimeout(autoSaveTimer);
    pendingImageInsertAfterBlockId = null;
    pendingDrawingInsertAfterBlockId = null;
    closeImageModal();
    closeDrawingModal();
    await restoreBackupData(backup.data);
    await loadData();
    await ensureInitialFolder();
    selectInitialFolder();
    selectedNoteId = null;
    renderAll();
    setSaveStatus("保存済み");

    alert("バックアップを復元しました。");
  } catch (error) {
    console.error(error);
    alert("バックアップの読み込みに失敗しました。ファイル形式を確認してください。");
  } finally {
    elements.backupFileInput.value = "";
  }
}

function importBackupFile(file) {
  return readJsonFile(file);
}

function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

function validateBackupData(backup) {
  if (!backup || typeof backup !== "object") {
    throw new Error("バックアップファイルの形式が正しくありません。");
  }

  if (!backup.data || typeof backup.data !== "object") {
    throw new Error("バックアップファイルのdataが見つかりません。");
  }

  if (!Array.isArray(backup.data.folders) ||
      !Array.isArray(backup.data.notes) ||
      !Array.isArray(backup.data.assets)) {
    throw new Error("バックアップファイルの配列形式が正しくありません。");
  }

  if (!backup.data.folders.every((folder) => folder && folder.id)) {
    throw new Error("idのないフォルダが含まれています。");
  }

  if (!backup.data.notes.every((note) => note && note.id)) {
    throw new Error("idのないメモが含まれています。");
  }

  if (!backup.data.assets.every((asset) => asset && asset.id)) {
    throw new Error("idのないassetが含まれています。");
  }
}

function downloadJsonFile(jsonText, fileName) {
  const blob = new Blob([jsonText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createBackupFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `memo_backup_${year}-${month}-${day}_${hour}${minute}.json`;
}

function renderAll() {
  renderFolderList();
  renderNoteList();
  renderEditor();
  updateActionButtons();
}

function renderFolderList() {
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

function createFolderButton(folder, isChild) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `folder-item${isChild ? " child-folder" : ""}${folder.id === selectedFolderId ? " selected" : ""}`;
  button.addEventListener("click", () => {
    selectedFolderId = folder.id;
    selectedNoteId = null;
    renderAll();
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

function renderNoteList() {
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
    noteItem.className = `note-card${note.id === selectedNoteId ? " selected" : ""}`;

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "note-item";
    selectButton.addEventListener("click", () => {
      selectedNoteId = note.id;
      renderAll();
    });

    const title = document.createElement("span");
    title.className = "note-title";
    title.textContent = note.title || "無題";

    const date = document.createElement("span");
    date.className = "note-date";
    date.textContent = formatDate(note.updatedAt);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "note-delete-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => deleteNoteById(note.id));

    selectButton.append(title, date);
    noteItem.append(selectButton, deleteButton);
    elements.noteList.appendChild(noteItem);
  });
}

function renderEditor() {
  const note = getSelectedNote();
  isLoadingEditor = true;

  if (!note) {
    elements.emptyEditorMessage.classList.remove("hidden");
    elements.editorForm.classList.add("hidden");
    elements.noteTitleInput.value = "";
    elements.blockList.innerHTML = "";
    setSaveStatus("保存済み");
    isLoadingEditor = false;
    return;
  }

  elements.emptyEditorMessage.classList.add("hidden");
  elements.editorForm.classList.remove("hidden");
  elements.noteTitleInput.value = note.title;
  renderBlockList(note);
  setSaveStatus("保存済み");
  isLoadingEditor = false;
}

function renderBlockList(note) {
  elements.blockList.innerHTML = "";

  if (note.blocks.length === 0) {
    elements.blockList.appendChild(createEmptyList("本文ブロックがありません。"));
    return;
  }

  note.blocks.forEach((block, index) => {
    elements.blockList.appendChild(renderBlock(block, index, note.blocks.length));
  });
}

function renderBlock(block, index, blockCount) {
  if (block.type === "text") {
    return renderTextBlock(block, index, blockCount);
  }

  if (block.type === "image") {
    return renderImageBlock(block, index, blockCount);
  }

  if (block.type === "drawing") {
    return renderDrawingBlock(block, index, blockCount);
  }

  return createEmptyList(`未対応ブロック: ${block.type}`);
}

function renderTextBlock(block, index, blockCount) {
  const wrapper = document.createElement("section");
  wrapper.className = "text-block";

  wrapper.append(
    createBlockControls(block, index, blockCount),
    createBlockInsertActions(block.id)
  );

  const textarea = document.createElement("textarea");
  textarea.className = "text-block-input";
  textarea.value = block.text;
  textarea.placeholder = "本文を入力";
  textarea.addEventListener("input", () => {
    block.text = textarea.value;
    scheduleAutoSave();
  });

  wrapper.appendChild(textarea);
  return wrapper;
}

function renderImageBlock(block, index, blockCount) {
  const wrapper = document.createElement("section");
  wrapper.className = "image-block";

  wrapper.append(
    createBlockControls(block, index, blockCount),
    createBlockInsertActions(block.id)
  );

  const asset = getAssetById(block.assetId);
  if (!asset) {
    wrapper.appendChild(createMissingAssetMessage());
  } else {
    const previewWrap = document.createElement("div");
    previewWrap.className = "image-block-preview-wrap";

    const image = document.createElement("img");
    image.className = "image-block-preview";
    image.src = asset.dataUrl;
    image.alt = block.caption || asset.fileName || "画像ブロック";
    image.addEventListener("click", () => openImageModal(asset.dataUrl));

    previewWrap.appendChild(image);
    wrapper.appendChild(previewWrap);
  }

  const captionInput = document.createElement("input");
  captionInput.className = "image-caption-input";
  captionInput.type = "text";
  captionInput.value = block.caption || "";
  captionInput.placeholder = "キャプション";
  captionInput.addEventListener("input", () => {
    block.caption = captionInput.value;
    scheduleAutoSave();
  });

  wrapper.appendChild(captionInput);
  return wrapper;
}

function renderDrawingBlock(block, index, blockCount) {
  const wrapper = document.createElement("section");
  wrapper.className = "drawing-block";

  wrapper.append(
    createBlockControls(block, index, blockCount),
    createBlockInsertActions(block.id)
  );

  const asset = getAssetById(block.assetId);
  if (!asset) {
    wrapper.appendChild(createMissingAssetMessage("手書きデータが見つかりません"));
  } else {
    const previewWrap = document.createElement("div");
    previewWrap.className = "drawing-block-preview-wrap";

    const image = document.createElement("img");
    image.className = "drawing-block-preview";
    image.src = asset.dataUrl;
    image.alt = block.caption || "手書きメモ";
    image.addEventListener("click", () => openImageModal(asset.dataUrl));

    previewWrap.appendChild(image);
    wrapper.appendChild(previewWrap);
  }

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "編集";
  editButton.addEventListener("click", () => {
    openDrawingModal({
      assetId: block.assetId,
      afterBlockId: null
    });
  });

  const captionInput = document.createElement("input");
  captionInput.className = "drawing-caption-input";
  captionInput.type = "text";
  captionInput.value = block.caption || "";
  captionInput.placeholder = "キャプション";
  captionInput.addEventListener("input", () => {
    block.caption = captionInput.value;
    scheduleAutoSave();
  });

  wrapper.append(editButton, captionInput);
  return wrapper;
}

function createBlockControls(block, index, blockCount) {
  const controls = document.createElement("div");
  controls.className = "block-controls";

  const upButton = document.createElement("button");
  upButton.type = "button";
  upButton.textContent = "上へ";
  upButton.disabled = index === 0;
  upButton.addEventListener("click", () => moveBlockUp(block.id));

  const downButton = document.createElement("button");
  downButton.type = "button";
  downButton.textContent = "下へ";
  downButton.disabled = index === blockCount - 1;
  downButton.addEventListener("click", () => moveBlockDown(block.id));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-button";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", () => deleteBlock(block.id));

  controls.append(upButton, downButton, deleteButton);
  return controls;
}

function createBlockInsertActions(blockId) {
  const actions = document.createElement("div");
  actions.className = "block-insert-actions";

  const addTextButton = document.createElement("button");
  addTextButton.type = "button";
  addTextButton.textContent = "下にテキスト追加";
  addTextButton.addEventListener("click", () => insertTextBlockAfter(blockId));

  const addImageButton = document.createElement("button");
  addImageButton.type = "button";
  addImageButton.textContent = "下に画像追加";
  addImageButton.addEventListener("click", () => insertImageBlockAfter(blockId));

  const addDrawingButton = document.createElement("button");
  addDrawingButton.type = "button";
  addDrawingButton.textContent = "下に手書き追加";
  addDrawingButton.addEventListener("click", () => insertDrawingBlockAfter(blockId));

  actions.append(addTextButton, addImageButton, addDrawingButton);
  return actions;
}

function addTextBlock() {
  const note = getSelectedNote();
  if (!note) return;

  // Phase 3以降でUndo/Redoを入れる場合は、このようなブロック配列の変更前に
  // note.blocksのスナップショットを履歴スタックへ積むと管理しやすくなります。
  note.blocks.push(createTextBlock(""));
  renderBlockList(note);
  scheduleAutoSave();
  focusLastTextBlock();
}

function insertTextBlockAfter(blockId) {
  const note = getSelectedNote();
  if (!note) return;

  const index = note.blocks.findIndex((block) => block.id === blockId);
  const insertIndex = index === -1 ? note.blocks.length : index + 1;
  note.blocks.splice(insertIndex, 0, createTextBlock(""));
  renderBlockList(note);
  scheduleAutoSave();
}

function addImageBlock() {
  pendingImageInsertAfterBlockId = null;
  openImagePicker();
}

function insertImageBlockAfter(blockId) {
  pendingImageInsertAfterBlockId = blockId;
  openImagePicker();
}

function addDrawingBlock() {
  pendingDrawingInsertAfterBlockId = null;
  openDrawingModal({
    assetId: null,
    afterBlockId: null
  });
}

function insertDrawingBlockAfter(blockId) {
  pendingDrawingInsertAfterBlockId = blockId;
  openDrawingModal({
    assetId: null,
    afterBlockId: blockId
  });
}

function openImagePicker() {
  if (!getSelectedNote()) return;
  elements.imageFileInput.value = "";
  elements.imageFileInput.click();
}

async function handleImageFileSelected() {
  const file = elements.imageFileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください。");
    return;
  }

  try {
    setSaveStatus("画像処理中...", "saving");
    const asset = await createImageAsset(file);
    const block = createImageBlock(asset.id);
    insertBlock(block, pendingImageInsertAfterBlockId);
    pendingImageInsertAfterBlockId = null;
    renderEditor();
    await saveCurrentNote();
  } catch (error) {
    console.error(error);
    alert("画像の読み込みまたは縮小に失敗しました。");
    setSaveStatus("保存エラー", "error");
  }
}

function insertBlock(block, afterBlockId) {
  const note = getSelectedNote();
  if (!note) return;

  if (!afterBlockId) {
    note.blocks.push(block);
    return;
  }

  const index = note.blocks.findIndex((item) => item.id === afterBlockId);
  const insertIndex = index === -1 ? note.blocks.length : index + 1;
  note.blocks.splice(insertIndex, 0, block);
}

async function createImageAsset(file) {
  const dataUrl = await resizeImageFile(file);
  const asset = {
    id: createId("asset"),
    type: "image",
    dataUrl,
    fileName: file.name || "image.jpg",
    mimeType: "image/jpeg",
    createdAt: Date.now()
  };

  await saveAsset(asset);
  assets.push(asset);
  return asset;
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const size = calculateImageSize(image.width, image.height);
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, size.width, size.height);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY));
      };

      image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      image.src = reader.result;
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function calculateImageSize(width, height) {
  const ratio = Math.min(IMAGE_MAX_SIZE / width, IMAGE_MAX_SIZE / height, 1);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio)
  };
}

async function openDrawingModal(options = {}) {
  if (!getSelectedNote()) return;

  editingDrawingAssetId = options.assetId || null;
  pendingDrawingInsertAfterBlockId = options.afterBlockId || null;
  drawingMode = "pen";
  drawingSize = DRAWING_SIZES.medium;
  drawingStrokes = [];
  drawingRedoStack = [];
  currentDrawingStroke = null;
  isDrawing = false;
  baseDrawingDataUrl = null;

  setupDrawingCanvas();
  updateDrawingToolbarState();

  if (editingDrawingAssetId) {
    const asset = getAssetById(editingDrawingAssetId);
    if (!asset) {
      alert("手書きデータが見つかりません。");
      return;
    }
    try {
      await loadDrawingAssetToCanvas(asset);
    } catch (error) {
      console.error(error);
      alert("手書きデータの読み込みに失敗しました。");
      return;
    }
  } else {
    redrawCanvasFromStrokes();
  }

  elements.drawingModal.classList.remove("hidden");
  elements.drawingModal.setAttribute("aria-hidden", "false");
}

function closeDrawingModal() {
  elements.drawingModal.classList.add("hidden");
  elements.drawingModal.setAttribute("aria-hidden", "true");
  editingDrawingAssetId = null;
  pendingDrawingInsertAfterBlockId = null;
  currentDrawingStroke = null;
  isDrawing = false;
}

function setupDrawingCanvas() {
  const canvas = elements.drawingCanvas;
  canvas.width = DRAWING_WIDTH;
  canvas.height = DRAWING_HEIGHT;
  drawingContext = canvas.getContext("2d");
  drawingContext.lineCap = "round";
  drawingContext.lineJoin = "round";
  fillDrawingCanvasWhite();
}

function startDrawing(event) {
  if (elements.drawingModal.classList.contains("hidden")) return;

  event.preventDefault();
  elements.drawingCanvas.setPointerCapture(event.pointerId);
  isDrawing = true;
  const point = getCanvasPoint(event);
  currentDrawingStroke = {
    mode: drawingMode,
    size: drawingSize,
    color: drawingMode === "eraser" ? "#ffffff" : "#000000",
    points: [point]
  };
  drawStrokeDot(currentDrawingStroke, point);
}

function continueDrawing(event) {
  if (!isDrawing || !currentDrawingStroke) return;

  event.preventDefault();
  const point = getCanvasPoint(event);
  const previousPoint = currentDrawingStroke.points[currentDrawingStroke.points.length - 1];
  currentDrawingStroke.points.push(point);
  drawStrokeSegment(currentDrawingStroke, previousPoint, point);
}

function endDrawing(event) {
  if (!isDrawing || !currentDrawingStroke) return;

  event.preventDefault();
  if (elements.drawingCanvas.hasPointerCapture(event.pointerId)) {
    elements.drawingCanvas.releasePointerCapture(event.pointerId);
  }

  drawingStrokes.push(currentDrawingStroke);
  drawingRedoStack = [];
  currentDrawingStroke = null;
  isDrawing = false;
}

function redrawCanvasFromStrokes() {
  fillDrawingCanvasWhite();

  if (baseDrawingDataUrl) {
    const image = new Image();
    image.onload = () => {
      drawingContext.drawImage(image, 0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
      drawingStrokes.forEach(drawStrokeOperation);
    };
    image.src = baseDrawingDataUrl;
    return;
  }

  drawingStrokes.forEach(drawStrokeOperation);
}

function clearDrawingCanvas() {
  drawingStrokes.push({
    type: "clear"
  });
  drawingRedoStack = [];
  redrawCanvasFromStrokes();
}

function undoDrawing() {
  if (drawingStrokes.length === 0) return;

  const stroke = drawingStrokes.pop();
  drawingRedoStack.push(stroke);
  redrawCanvasFromStrokes();
}

function redoDrawing() {
  if (drawingRedoStack.length === 0) return;

  const stroke = drawingRedoStack.pop();
  drawingStrokes.push(stroke);
  redrawCanvasFromStrokes();
}

async function saveDrawingFromCanvas() {
  const dataUrl = elements.drawingCanvas.toDataURL("image/png");

  try {
    setSaveStatus("保存中...", "saving");

    if (editingDrawingAssetId) {
      await updateDrawingAsset(editingDrawingAssetId, dataUrl, DRAWING_WIDTH, DRAWING_HEIGHT);
    } else {
      const asset = await createDrawingAsset(dataUrl, DRAWING_WIDTH, DRAWING_HEIGHT);
      const block = createDrawingBlock(asset.id);
      insertBlock(block, pendingDrawingInsertAfterBlockId);
    }

    closeDrawingModal();
    renderEditor();
    await saveCurrentNote();
  } catch (error) {
    console.error(error);
    alert("手書きメモの保存に失敗しました。");
    setSaveStatus("保存エラー", "error");
  }
}

async function createDrawingAsset(dataUrl, width, height) {
  const now = Date.now();
  const asset = {
    id: createId("asset"),
    type: "drawing",
    dataUrl,
    width,
    height,
    createdAt: now,
    updatedAt: now
  };

  await saveAsset(asset);
  assets.push(asset);
  return asset;
}

async function updateDrawingAsset(assetId, dataUrl, width, height) {
  const asset = getAssetById(assetId);
  if (!asset) {
    throw new Error("手書きassetが見つかりません。");
  }

  asset.type = "drawing";
  asset.dataUrl = dataUrl;
  asset.width = width;
  asset.height = height;
  asset.updatedAt = Date.now();
  await saveAsset(asset);
}

function loadDrawingAssetToCanvas(asset) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      fillDrawingCanvasWhite();
      drawingContext.drawImage(image, 0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
      baseDrawingDataUrl = elements.drawingCanvas.toDataURL("image/png");
      resolve();
    };
    image.onerror = () => reject(new Error("手書きデータを読み込めませんでした。"));
    image.src = asset.dataUrl;
  });
}

function fillDrawingCanvasWhite() {
  drawingContext.fillStyle = "#ffffff";
  drawingContext.fillRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
}

function getCanvasPoint(event) {
  const rect = elements.drawingCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (DRAWING_WIDTH / rect.width),
    y: (event.clientY - rect.top) * (DRAWING_HEIGHT / rect.height)
  };
}

function drawStrokeOperation(stroke) {
  if (stroke.type === "clear") {
    fillDrawingCanvasWhite();
    return;
  }

  if (!stroke.points || stroke.points.length === 0) return;

  if (stroke.points.length === 1) {
    drawStrokeDot(stroke, stroke.points[0]);
    return;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    drawStrokeSegment(stroke, stroke.points[index - 1], stroke.points[index]);
  }
}

function drawStrokeSegment(stroke, fromPoint, toPoint) {
  drawingContext.strokeStyle = stroke.color;
  drawingContext.lineWidth = stroke.size;
  drawingContext.beginPath();
  drawingContext.moveTo(fromPoint.x, fromPoint.y);
  drawingContext.lineTo(toPoint.x, toPoint.y);
  drawingContext.stroke();
}

function drawStrokeDot(stroke, point) {
  drawingContext.fillStyle = stroke.color;
  drawingContext.beginPath();
  drawingContext.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
  drawingContext.fill();
}

function setDrawingMode(mode) {
  drawingMode = mode;
  updateDrawingToolbarState();
}

function setDrawingSize(size) {
  drawingSize = size;
  updateDrawingToolbarState();
}

function updateDrawingToolbarState() {
  elements.drawingPenButton.classList.toggle("active-tool", drawingMode === "pen");
  elements.drawingEraserButton.classList.toggle("active-tool", drawingMode === "eraser");
  elements.drawingSizeSmallButton.classList.toggle("active-tool", drawingSize === DRAWING_SIZES.small);
  elements.drawingSizeMediumButton.classList.toggle("active-tool", drawingSize === DRAWING_SIZES.medium);
  elements.drawingSizeLargeButton.classList.toggle("active-tool", drawingSize === DRAWING_SIZES.large);
}

async function deleteBlock(blockId) {
  const note = getSelectedNote();
  if (!note) return;

  const block = note.blocks.find((item) => item.id === blockId);
  if (!block) return;

  note.blocks = note.blocks.filter((item) => item.id !== blockId);

  if ((block.type === "image" || block.type === "drawing") && block.assetId) {
    await deleteAssetIfUnused(block.assetId, note.id, block.id);
  }

  renderBlockList(note);
  await saveCurrentNote(note.id);
}

function moveBlockUp(blockId) {
  const note = getSelectedNote();
  if (!note) return;

  const index = note.blocks.findIndex((block) => block.id === blockId);
  if (index <= 0) return;

  const target = note.blocks[index];
  note.blocks.splice(index, 1);
  note.blocks.splice(index - 1, 0, target);
  renderBlockList(note);
  scheduleAutoSave();
}

function moveBlockDown(blockId) {
  const note = getSelectedNote();
  if (!note) return;

  const index = note.blocks.findIndex((block) => block.id === blockId);
  if (index === -1 || index >= note.blocks.length - 1) return;

  const target = note.blocks[index];
  note.blocks.splice(index, 1);
  note.blocks.splice(index + 1, 0, target);
  renderBlockList(note);
  scheduleAutoSave();
}

function openImageModal(dataUrl) {
  elements.imageModalImage.src = dataUrl;
  elements.imageModal.classList.remove("hidden");
  elements.imageModal.setAttribute("aria-hidden", "false");
}

function closeImageModal() {
  elements.imageModal.classList.add("hidden");
  elements.imageModal.setAttribute("aria-hidden", "true");
  elements.imageModalImage.removeAttribute("src");
}

function isAssetUsedElsewhere(assetId, exceptNoteId, exceptBlockId) {
  return notes.some((note) => {
    return note.blocks.some((block) => {
      if (note.id === exceptNoteId && block.id === exceptBlockId) return false;
      return (block.type === "image" || block.type === "drawing") && block.assetId === assetId;
    });
  });
}

async function deleteAssetIfUnused(assetId, exceptNoteId, exceptBlockId) {
  if (isAssetUsedElsewhere(assetId, exceptNoteId, exceptBlockId)) return;

  await deleteAsset(assetId);
  assets = assets.filter((asset) => asset.id !== assetId);
}

async function deleteUnusedAssets(assetIds) {
  for (const assetId of assetIds) {
    if (!isAssetUsedElsewhere(assetId, null, null)) {
      await deleteAsset(assetId);
      assets = assets.filter((asset) => asset.id !== assetId);
    }
  }
}

function collectAssetIdsFromNotes(targetNotes) {
  const assetIds = targetNotes.flatMap((note) => {
    return note.blocks
      .filter((block) => (block.type === "image" || block.type === "drawing") && block.assetId)
      .map((block) => block.assetId);
  });

  return [...new Set(assetIds)];
}

function getAssetById(assetId) {
  return assets.find((asset) => asset.id === assetId) || null;
}

function createMissingAssetMessage(messageText = "画像データが見つかりません") {
  const message = document.createElement("div");
  message.className = "missing-asset";
  message.textContent = messageText;
  return message;
}

function scheduleAutoSave() {
  const note = getSelectedNote();
  if (!note) return;

  const noteId = note.id;
  setSaveStatus("保存中...", "saving");
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => {
    saveCurrentNote(noteId);
  }, AUTO_SAVE_DELAY);
}

async function saveCurrentNote(noteId = selectedNoteId) {
  const note = notes.find((item) => item.id === noteId);
  if (!note) return;

  try {
    note.updatedAt = Date.now();
    await saveNote(note);
    if (note.id === selectedNoteId) {
      setSaveStatus("保存済み");
    }
    renderNoteList();
  } catch (error) {
    console.error(error);
    if (note.id === selectedNoteId) {
      setSaveStatus("保存エラー", "error");
    }
  }
}

function setSaveStatus(text, stateClass) {
  elements.saveStatus.textContent = text;
  elements.saveStatus.classList.remove("saving", "error");
  if (stateClass) {
    elements.saveStatus.classList.add(stateClass);
  }
}

function updateActionButtons() {
  const selectedFolder = getSelectedFolder();
  const hasFolder = Boolean(selectedFolder);
  const canAddChild = hasFolder && !selectedFolder.parentId;
  const hasNote = Boolean(getSelectedNote());

  elements.addChildFolderButton.disabled = !canAddChild;
  elements.renameFolderButton.disabled = !hasFolder;
  elements.deleteFolderButton.disabled = !hasFolder;
  elements.addNoteButton.disabled = !hasFolder;
  elements.addTextBlockButton.disabled = !hasNote;
  elements.addImageBlockButton.disabled = !hasNote;
  elements.addDrawingBlockButton.disabled = !hasNote;
}

function getSelectedFolder() {
  return folders.find((folder) => folder.id === selectedFolderId) || null;
}

function getSelectedNote() {
  return notes.find((note) => note.id === selectedNoteId) || null;
}

function getNotesInSelectedFolder() {
  return notes
    .filter((note) => note.folderId === selectedFolderId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function getSortedFolders() {
  return [...folders].sort((a, b) => {
    if (a.parentId === b.parentId) {
      return a.createdAt - b.createdAt;
    }
    return String(a.parentId || "").localeCompare(String(b.parentId || ""));
  });
}

function getDescendantFolderIds(folderId) {
  return folders
    .filter((folder) => folder.parentId === folderId)
    .map((folder) => folder.id);
}

function normalizeName(value) {
  if (value === null) return "";
  return value.trim();
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function createEmptyList(message) {
  const item = document.createElement("div");
  item.className = "empty-list";
  item.textContent = message;
  return item;
}

function focusLastTextBlock() {
  const textareas = elements.blockList.querySelectorAll("textarea");
  const lastTextarea = textareas[textareas.length - 1];
  if (lastTextarea) lastTextarea.focus();
}
