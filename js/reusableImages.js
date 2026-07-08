"use strict";

import {
  getReusableAssetName,
  getReusableImageAssets
} from "./assets.js";
import { insertBlock } from "./blocks.js";
import { openImageCropModal } from "./cropImage.js";
import { saveAsset } from "./db.js";
import {
  createImageBlock,
  resizeImageFile
} from "./imageBlocks.js";
import { saveCurrentNote, setSaveStatus } from "./notes.js";
import { appActions, elements, state } from "./state.js";
import { createEmptyList, createId, formatDate } from "./utils.js";

export function registerReusableImage() {
  elements.reusableImageFileInput.value = "";
  elements.reusableImageFileInput.click();
}

export async function handleReusableImageFileSelected() {
  const file = elements.reusableImageFileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください。");
    elements.reusableImageFileInput.value = "";
    return;
  }

  try {
    setSaveStatus("登録画像を処理中...", "saving");
    const cropResult = await openImageCropModal(file);
    if (!cropResult) {
      setSaveStatus("保存済み");
      return;
    }

    const defaultName = file.name || "登録画像";
    const reusableName = prompt("登録画像の名前を入力してください。", defaultName);
    if (reusableName === null) {
      setSaveStatus("保存済み");
      return;
    }

    const dataUrl = cropResult.useWholeImage ? await resizeImageFile(file) : cropResult.dataUrl;
    const asset = createReusableImageAssetObject(
      dataUrl,
      file.name || cropResult.fileName || "image.jpg",
      reusableName.trim() || defaultName
    );

    await saveAsset(asset);
    state.assets.push(asset);
    setSaveStatus("保存済み");
    alert("登録画像を保存しました。");
    appActions.renderAll();
  } catch (error) {
    console.error(error);
    alert("登録画像の保存に失敗しました。");
    setSaveStatus("保存エラー", "error");
  } finally {
    elements.reusableImageFileInput.value = "";
  }
}

export function openReusableImageModal() {
  renderReusableImageList();
  elements.reusableImageModal.classList.remove("hidden");
  elements.reusableImageModal.setAttribute("aria-hidden", "false");
}

export function closeReusableImageModal() {
  elements.reusableImageModal.classList.add("hidden");
  elements.reusableImageModal.setAttribute("aria-hidden", "true");
}

export function renderReusableImageList() {
  const list = elements.reusableImageList;
  list.innerHTML = "";

  const reusableAssets = getReusableImageAssets();
  if (reusableAssets.length === 0) {
    list.appendChild(createEmptyList("登録画像はまだありません。"));
    return;
  }

  reusableAssets.forEach((asset) => {
    list.appendChild(createReusableImageItem(asset));
  });
}

function createReusableImageAssetObject(dataUrl, fileName, reusableName) {
  return {
    id: createId("asset"),
    type: "image",
    dataUrl,
    fileName,
    mimeType: "image/jpeg",
    createdAt: Date.now(),
    isReusable: true,
    reusableName
  };
}

function createReusableImageItem(asset) {
  const item = document.createElement("article");
  item.className = "reusable-image-item";

  const image = document.createElement("img");
  image.className = "reusable-image-thumb";
  image.src = asset.dataUrl;
  image.alt = getReusableAssetName(asset);

  const body = document.createElement("div");
  body.className = "reusable-image-body";

  const title = document.createElement("div");
  title.className = "reusable-image-title";
  title.textContent = getReusableAssetName(asset);

  const meta = document.createElement("div");
  meta.className = "reusable-image-meta";
  meta.textContent = asset.fileName || formatDate(asset.createdAt);

  body.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "reusable-image-actions";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "primary-button";
  addButton.textContent = "追加";
  addButton.disabled = !state.selectedNoteId;
  addButton.addEventListener("click", () => addReusableImageToCurrentNote(asset.id));

  const unregisterButton = document.createElement("button");
  unregisterButton.type = "button";
  unregisterButton.textContent = "登録解除";
  unregisterButton.addEventListener("click", () => unregisterReusableImage(asset.id));

  actions.append(addButton, unregisterButton);
  item.append(image, body, actions);
  return item;
}

async function addReusableImageToCurrentNote(assetId) {
  if (!state.selectedNoteId) return;

  const block = createImageBlock(assetId);
  insertBlock(block, null);
  state.editorMode = "edit";
  closeReusableImageModal();
  appActions.renderAll();
  await saveCurrentNote();
}

async function unregisterReusableImage(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;

  const ok = confirm(
    "この登録画像を解除しますか？\nすでにメモ内で使っている画像ブロックは、登録解除後も同じ画像を参照し続けます。"
  );
  if (!ok) return;

  asset.isReusable = false;
  asset.reusableName = "";
  await saveAsset(asset);
  renderReusableImageList();
}
