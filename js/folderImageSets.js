"use strict";

import { deleteAssetIfUnused, getAssetById } from "./assets.js";
import { getViewportCenterBlockId, insertBlock } from "./blocks.js";
import { deleteAsset, saveAsset, saveFolder, saveNote } from "./db.js";
import { getParentFolderForNote } from "./folders.js";
import {
  createImageAssetObject,
  createImageBlock,
  resizeImageFile
} from "./imageBlocks.js";
import { getSelectedNote, setSaveStatus } from "./notes.js";
import { appActions, elements, state } from "./state.js";
import { createEmptyList, createId, normalizeName } from "./utils.js";

export function openFolderImageSetModal(options = {}) {
  const note = getSelectedNote();
  const parentFolder = getParentFolderForNote(note);
  if (!note || !parentFolder) {
    alert("選択中のメモから親フォルダを特定できません。");
    return;
  }

  const mode = options.mode === "replace" ? "replace" : "insert";
  if (mode === "replace") {
    const block = note.blocks.find((item) => item.id === options.replaceBlockId);
    if (!block || block.type !== "image") {
      alert("差し替え対象の画像ブロックが見つかりません。");
      return;
    }
  }

  state.folderImageSetMode = mode;
  state.folderImageSetParentFolderId = parentFolder.id;
  state.pendingFolderImageSetInsertAfterBlockId = mode === "insert"
    ? (Object.prototype.hasOwnProperty.call(options, "afterBlockId")
      ? options.afterBlockId
      : getViewportCenterBlockId())
    : null;
  state.pendingFolderImageSetReplaceBlockId = mode === "replace"
    ? options.replaceBlockId
    : null;
  state.pendingFolderImageSetUploadSetId = null;
  state.folderImageSetProcessing = false;

  renderFolderImageSetModal();
  elements.folderImageSetModal.classList.remove("hidden");
  elements.folderImageSetModal.setAttribute("aria-hidden", "false");
}

export function closeFolderImageSetModal() {
  if (state.folderImageSetProcessing) return;

  elements.folderImageSetModal.classList.add("hidden");
  elements.folderImageSetModal.setAttribute("aria-hidden", "true");
  elements.folderImageSetList.innerHTML = "";
  resetFolderImageSetModalState();
}

export function resetFolderImageSetModalState() {
  state.folderImageSetMode = null;
  state.folderImageSetParentFolderId = null;
  state.pendingFolderImageSetInsertAfterBlockId = null;
  state.pendingFolderImageSetReplaceBlockId = null;
  state.pendingFolderImageSetUploadSetId = null;
  state.folderImageSetProcessing = false;
  if (elements.folderImageSetFileInput) {
    elements.folderImageSetFileInput.value = "";
  }
}

export async function createFolderImageSet() {
  if (state.folderImageSetProcessing) return;

  const name = normalizeName(prompt("画像セット名を入力してください。"));
  if (!name) return;

  const parentFolder = getCurrentParentFolder();
  if (!parentFolder) return;

  const now = Date.now();
  const imageSet = {
    id: createId("imageSet"),
    name,
    createdAt: now,
    updatedAt: now,
    items: []
  };

  await saveFolderMutation(
    parentFolder,
    () => parentFolder.imageSets.push(imageSet),
    () => {
      parentFolder.imageSets = parentFolder.imageSets.filter((item) => item.id !== imageSet.id);
    },
    "画像セットの作成に失敗しました。"
  );
}

export function chooseFolderImageSetFiles(imageSetId) {
  if (state.folderImageSetProcessing) return;
  if (!findImageSet(imageSetId)) return;

  state.pendingFolderImageSetUploadSetId = imageSetId;
  elements.folderImageSetFileInput.value = "";
  elements.folderImageSetFileInput.click();
}

export async function handleFolderImageSetFilesSelected() {
  const files = Array.from(elements.folderImageSetFileInput.files || []);
  const imageSetId = state.pendingFolderImageSetUploadSetId;
  elements.folderImageSetFileInput.value = "";
  state.pendingFolderImageSetUploadSetId = null;

  if (state.folderImageSetProcessing || !imageSetId || files.length === 0) return;

  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length === 0) {
    alert("画像ファイルを選択してください。");
    return;
  }
  if (imageFiles.length !== files.length) {
    alert("画像ではないファイルは除外しました。");
  }

  const parentFolder = getCurrentParentFolder();
  const imageSet = findImageSet(imageSetId);
  if (!parentFolder || !imageSet) return;

  const createdAssets = [];
  const newItems = [];
  const originalParentUpdatedAt = parentFolder.updatedAt;
  const originalSetUpdatedAt = imageSet.updatedAt;
  let itemsAdded = false;

  setFolderImageSetProcessing(true);
  try {
    for (let index = 0; index < imageFiles.length; index += 1) {
      const file = imageFiles[index];
      setSaveStatus(`画像を処理中... ${index + 1} / ${imageFiles.length}`, "saving");
      const dataUrl = await resizeImageFile(file);
      const asset = createImageAssetObject(dataUrl, file.name || `image-${index + 1}.jpg`);
      await saveAsset(asset);
      state.assets.push(asset);
      createdAssets.push(asset);

      const now = Date.now();
      newItems.push({
        id: createId("imageSetItem"),
        assetId: asset.id,
        name: getInitialImageName(file, index),
        createdAt: now,
        updatedAt: now
      });
    }

    imageSet.items.push(...newItems);
    itemsAdded = true;
    imageSet.updatedAt = Date.now();
    parentFolder.updatedAt = imageSet.updatedAt;
    await saveFolder(parentFolder);
    setSaveStatus("保存済み");
  } catch (error) {
    if (itemsAdded) {
      const addedIds = new Set(newItems.map((item) => item.id));
      imageSet.items = imageSet.items.filter((item) => !addedIds.has(item.id));
      imageSet.updatedAt = originalSetUpdatedAt;
      parentFolder.updatedAt = originalParentUpdatedAt;
    }

    await removeCreatedAssets(createdAssets);
    console.error(error);
    alert("画像の一括追加に失敗しました。今回追加した画像は登録していません。");
    setSaveStatus("保存エラー", "error");
  } finally {
    setFolderImageSetProcessing(false);
  }
}

export async function renameFolderImageSet(imageSetId) {
  if (state.folderImageSetProcessing) return;
  const parentFolder = getCurrentParentFolder();
  const imageSet = findImageSet(imageSetId);
  if (!parentFolder || !imageSet) return;

  const name = normalizeName(prompt("新しい画像セット名を入力してください。", imageSet.name));
  if (!name || name === imageSet.name) return;

  const originalName = imageSet.name;
  const originalUpdatedAt = imageSet.updatedAt;
  await saveFolderMutation(
    parentFolder,
    () => {
      imageSet.name = name;
      imageSet.updatedAt = Date.now();
    },
    () => {
      imageSet.name = originalName;
      imageSet.updatedAt = originalUpdatedAt;
    },
    "画像セット名の変更に失敗しました。"
  );
}

export async function renameFolderImageSetItem(imageSetId, itemId) {
  if (state.folderImageSetProcessing) return;
  const parentFolder = getCurrentParentFolder();
  const imageSet = findImageSet(imageSetId);
  const item = imageSet?.items.find((entry) => entry.id === itemId);
  if (!parentFolder || !imageSet || !item) return;

  const name = normalizeName(prompt("新しい画像名を入力してください。", item.name));
  if (!name || name === item.name) return;

  const originalName = item.name;
  const originalUpdatedAt = item.updatedAt;
  const originalSetUpdatedAt = imageSet.updatedAt;
  await saveFolderMutation(
    parentFolder,
    () => {
      const now = Date.now();
      item.name = name;
      item.updatedAt = now;
      imageSet.updatedAt = now;
    },
    () => {
      item.name = originalName;
      item.updatedAt = originalUpdatedAt;
      imageSet.updatedAt = originalSetUpdatedAt;
    },
    "画像名の変更に失敗しました。"
  );
}

export async function removeFolderImageSetItem(imageSetId, itemId) {
  if (state.folderImageSetProcessing) return;
  const parentFolder = getCurrentParentFolder();
  const imageSet = findImageSet(imageSetId);
  const itemIndex = imageSet?.items.findIndex((entry) => entry.id === itemId) ?? -1;
  if (!parentFolder || !imageSet || itemIndex < 0) return;

  const ok = confirm(
    "この画像を画像セットから外しますか？\n" +
    "すでにメモ内で使用している画像ブロックは、そのまま残ります。"
  );
  if (!ok) return;

  const item = imageSet.items[itemIndex];
  const originalSetUpdatedAt = imageSet.updatedAt;
  const saved = await saveFolderMutation(
    parentFolder,
    () => {
      imageSet.items.splice(itemIndex, 1);
      imageSet.updatedAt = Date.now();
    },
    () => {
      imageSet.items.splice(itemIndex, 0, item);
      imageSet.updatedAt = originalSetUpdatedAt;
    },
    "画像をセットから外せませんでした。"
  );
  if (!saved) return;

  try {
    await deleteAssetIfUnused(item.assetId);
  } catch (error) {
    console.warn("未使用画像アセットの削除に失敗しました。", error);
  }
}

export async function selectFolderImageSetItem(assetId) {
  if (state.folderImageSetProcessing || !getAssetById(assetId)) return;
  if (state.folderImageSetMode === "replace") {
    await replaceCurrentImageBlock(assetId);
    return;
  }

  await insertImageSetBlock(assetId);
}

export function renderFolderImageSetModal() {
  const parentFolder = getCurrentParentFolder();
  const list = elements.folderImageSetList;
  if (!parentFolder || !list) return;

  elements.folderImageSetModalTitle.textContent = `「${parentFolder.name}」の画像セット`;
  elements.createFolderImageSetButton.disabled = state.folderImageSetProcessing;
  elements.folderImageSetModalCloseButton.disabled = state.folderImageSetProcessing;
  elements.folderImageSetModalCancelButton.disabled = state.folderImageSetProcessing;
  list.innerHTML = "";

  const imageSets = Array.isArray(parentFolder.imageSets) ? parentFolder.imageSets : [];
  if (imageSets.length === 0) {
    list.appendChild(createEmptyList("画像セットはまだありません。"));
    return;
  }

  imageSets.forEach((imageSet) => {
    list.appendChild(createImageSetSection(imageSet));
  });
}

function createImageSetSection(imageSet) {
  const section = document.createElement("section");
  section.className = "folder-image-set";

  const header = document.createElement("header");
  header.className = "folder-image-set-header";

  const title = document.createElement("h3");
  title.textContent = imageSet.name || "名称未設定";

  const actions = document.createElement("div");
  actions.className = "folder-image-set-header-actions";

  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.textContent = "セット名変更";
  renameButton.disabled = state.folderImageSetProcessing;
  renameButton.addEventListener("click", () => renameFolderImageSet(imageSet.id));

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "primary-button";
  addButton.textContent = "＋ 画像をまとめて追加";
  addButton.disabled = state.folderImageSetProcessing;
  addButton.addEventListener("click", () => chooseFolderImageSetFiles(imageSet.id));

  actions.append(renameButton, addButton);
  header.append(title, actions);
  section.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "folder-image-set-grid";
  const items = Array.isArray(imageSet.items) ? imageSet.items : [];
  if (items.length === 0) {
    grid.appendChild(createEmptyList("このセットには画像がありません。"));
  } else {
    items.forEach((item) => grid.appendChild(createImageSetItem(imageSet.id, item)));
  }
  section.appendChild(grid);
  return section;
}

function createImageSetItem(imageSetId, item) {
  const card = document.createElement("article");
  card.className = "folder-image-set-item";
  const asset = getAssetById(item.assetId);

  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.className = "folder-image-set-select";
  selectButton.disabled = state.folderImageSetProcessing || !asset;
  selectButton.setAttribute("aria-label", `${item.name || "画像"}を${state.folderImageSetMode === "replace" ? "差し替え" : "追加"}`);
  selectButton.addEventListener("click", () => selectFolderImageSetItem(item.assetId));

  if (asset) {
    const image = document.createElement("img");
    image.className = "folder-image-set-thumb";
    image.src = asset.dataUrl;
    image.alt = item.name || asset.fileName || "画像セット画像";
    selectButton.appendChild(image);
  } else {
    const missing = document.createElement("span");
    missing.className = "folder-image-set-missing";
    missing.textContent = "画像データなし";
    selectButton.appendChild(missing);
  }

  const name = document.createElement("div");
  name.className = "folder-image-set-item-name";
  name.textContent = item.name || "名称未設定";

  const useButton = document.createElement("button");
  useButton.type = "button";
  useButton.className = "primary-button";
  useButton.textContent = state.folderImageSetMode === "replace" ? "差し替え" : "追加";
  useButton.disabled = state.folderImageSetProcessing || !asset;
  useButton.addEventListener("click", () => selectFolderImageSetItem(item.assetId));

  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.textContent = "名前変更";
  renameButton.disabled = state.folderImageSetProcessing;
  renameButton.addEventListener("click", () => renameFolderImageSetItem(imageSetId, item.id));

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "danger-button";
  removeButton.textContent = "セットから外す";
  removeButton.disabled = state.folderImageSetProcessing;
  removeButton.addEventListener("click", () => removeFolderImageSetItem(imageSetId, item.id));

  const actions = document.createElement("div");
  actions.className = "folder-image-set-item-actions";
  actions.append(useButton, renameButton, removeButton);
  card.append(selectButton, name, actions);
  return card;
}

async function insertImageSetBlock(assetId) {
  const note = getSelectedNote();
  if (!note) return;

  const block = createImageBlock(assetId);
  const originalUpdatedAt = note.updatedAt;
  insertBlock(block, state.pendingFolderImageSetInsertAfterBlockId);
  note.updatedAt = Date.now();

  setFolderImageSetProcessing(true);
  setSaveStatus("保存中...", "saving");
  try {
    await saveNote(note);
  } catch (error) {
    note.blocks = note.blocks.filter((item) => item.id !== block.id);
    note.updatedAt = originalUpdatedAt;
    console.error(error);
    alert("画像ブロックを追加できませんでした。");
    setSaveStatus("保存エラー", "error");
    setFolderImageSetProcessing(false);
    return;
  }

  state.editorMode = "edit";
  setFolderImageSetProcessing(false);
  closeFolderImageSetModal();
  appActions.renderAll();
  setSaveStatus("保存済み");
}

async function replaceCurrentImageBlock(assetId) {
  const note = getSelectedNote();
  const block = note?.blocks.find((item) => item.id === state.pendingFolderImageSetReplaceBlockId);
  if (!note || !block || block.type !== "image") return;
  if (block.assetId === assetId) {
    closeFolderImageSetModal();
    return;
  }

  const originalAssetId = block.assetId;
  const originalUpdatedAt = note.updatedAt;
  block.assetId = assetId;
  note.updatedAt = Date.now();
  setFolderImageSetProcessing(true);
  setSaveStatus("保存中...", "saving");

  try {
    await saveNote(note);
  } catch (error) {
    block.assetId = originalAssetId;
    note.updatedAt = originalUpdatedAt;
    console.error(error);
    alert("画像を差し替えできませんでした。");
    setSaveStatus("保存エラー", "error");
    setFolderImageSetProcessing(false);
    return;
  }

  try {
    await deleteAssetIfUnused(originalAssetId, note.id, block.id);
  } catch (error) {
    console.warn("差し替え前の未使用画像アセット削除に失敗しました。", error);
  }

  setFolderImageSetProcessing(false);
  closeFolderImageSetModal();
  appActions.renderAll();
  setSaveStatus("保存済み");
}

async function saveFolderMutation(parentFolder, apply, rollback, errorMessage) {
  if (state.folderImageSetProcessing) return false;
  const originalUpdatedAt = parentFolder.updatedAt;
  let applied = false;

  setFolderImageSetProcessing(true);
  setSaveStatus("保存中...", "saving");

  try {
    apply();
    applied = true;
    parentFolder.updatedAt = Date.now();
    await saveFolder(parentFolder);
    setSaveStatus("保存済み");
    return true;
  } catch (error) {
    if (applied) rollback();
    parentFolder.updatedAt = originalUpdatedAt;
    console.error(error);
    alert(errorMessage);
    setSaveStatus("保存エラー", "error");
    return false;
  } finally {
    setFolderImageSetProcessing(false);
  }
}

function setFolderImageSetProcessing(isProcessing) {
  state.folderImageSetProcessing = isProcessing;
  renderFolderImageSetModal();
}

function getCurrentParentFolder() {
  const folder = state.folders.find((item) => {
    return item.id === state.folderImageSetParentFolderId && !item.parentId;
  });
  if (!folder) return null;
  if (!Array.isArray(folder.imageSets)) folder.imageSets = [];
  folder.imageSets = folder.imageSets.filter((imageSet) => imageSet && typeof imageSet === "object");
  folder.imageSets.forEach((imageSet) => {
    if (!Array.isArray(imageSet.items)) imageSet.items = [];
  });
  return folder;
}

function findImageSet(imageSetId) {
  const parentFolder = getCurrentParentFolder();
  return parentFolder?.imageSets.find((imageSet) => imageSet.id === imageSetId) || null;
}

function getInitialImageName(file, index) {
  const fileName = String(file.name || "").trim();
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || `画像${index + 1}`;
}

async function removeCreatedAssets(assets) {
  for (const asset of assets) {
    try {
      await deleteAsset(asset.id);
    } catch (error) {
      console.warn("作成途中の画像アセット削除に失敗しました。", error);
    }
    state.assets = state.assets.filter((item) => item.id !== asset.id);
  }
}
