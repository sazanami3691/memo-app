"use strict";

import { createBlockControls, createBlockInsertActions, insertBlock } from "./blocks.js";
import { createMissingAssetMessage, getAssetById } from "./assets.js";
import { saveAsset } from "./db.js";
import { saveCurrentNote, scheduleAutoSave, setSaveStatus } from "./notes.js";
import { appActions, elements, IMAGE_JPEG_QUALITY, IMAGE_MAX_SIZE, state } from "./state.js";
import { createId } from "./utils.js";

export function createImageBlock(assetId) {
  return {
    id: createId("block"),
    type: "image",
    assetId,
    caption: ""
  };
}

export function addImageBlock() {
  state.pendingImageInsertAfterBlockId = null;
  openImagePicker();
}

export function insertImageBlockAfter(blockId) {
  state.pendingImageInsertAfterBlockId = blockId;
  openImagePicker();
}

export function openImagePicker() {
  if (!state.selectedNoteId) return;
  elements.imageFileInput.value = "";
  elements.imageFileInput.click();
}

export async function handleImageFileSelected() {
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
    insertBlock(block, state.pendingImageInsertAfterBlockId);
    state.pendingImageInsertAfterBlockId = null;
    appActions.renderAll();
    await saveCurrentNote();
  } catch (error) {
    console.error(error);
    alert("画像の読み込みまたは縮小に失敗しました。");
    setSaveStatus("保存エラー", "error");
  }
}

export async function createImageAsset(file) {
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
  state.assets.push(asset);
  return asset;
}

export function resizeImageFile(file) {
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

export function calculateImageSize(width, height) {
  const ratio = Math.min(IMAGE_MAX_SIZE / width, IMAGE_MAX_SIZE / height, 1);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio)
  };
}

export function renderImageBlock(block, index, blockCount) {
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

export function renderPreviewImageBlock(block) {
  const asset = getAssetById(block.assetId);
  if (!asset) {
    return createPreviewMissingAsset("画像データが見つかりません");
  }

  const wrapper = document.createElement("figure");
  wrapper.className = "preview-image-wrap";

  const image = document.createElement("img");
  image.className = "preview-image";
  image.src = asset.dataUrl;
  image.alt = block.caption || asset.fileName || "画像";
  image.addEventListener("click", () => openImageModal(asset.dataUrl));
  wrapper.appendChild(image);

  if (block.caption) {
    const caption = document.createElement("figcaption");
    caption.className = "preview-caption";
    caption.textContent = block.caption;
    wrapper.appendChild(caption);
  }

  return wrapper;
}

function createPreviewMissingAsset(messageText) {
  const message = document.createElement("div");
  message.className = "preview-missing-asset";
  message.textContent = messageText;
  return message;
}

export function openImageModal(dataUrl) {
  elements.imageModalImage.src = dataUrl;
  elements.imageModal.classList.remove("hidden");
  elements.imageModal.setAttribute("aria-hidden", "false");
}

export function closeImageModal() {
  elements.imageModal.classList.add("hidden");
  elements.imageModal.setAttribute("aria-hidden", "true");
  elements.imageModalImage.removeAttribute("src");
}
