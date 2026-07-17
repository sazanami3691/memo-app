"use strict";

import { elements, IMAGE_JPEG_QUALITY, IMAGE_MAX_SIZE } from "./state.js";

const CROP_MARGIN = 16;
const CROP_HANDLE_SIZE = 18;
const MIN_CROP_SIZE = 40;

const cropState = {
  image: null,
  fileName: "",
  imageRect: null,
  cropRect: null,
  action: null,
  startPoint: null,
  startCropRect: null,
  resolve: null
};

export function setupImageCropModal() {
  elements.imageCropCloseButton.addEventListener("click", cancelImageCrop);
  elements.imageCropCancelButton.addEventListener("click", cancelImageCrop);
  elements.imageCropResetButton.addEventListener("click", resetCropToCenter);
  elements.imageCropUseWholeButton.addEventListener("click", useWholeImage);
  elements.imageCropApplyButton.addEventListener("click", applyImageCrop);
  elements.imageCropCanvas.addEventListener("pointerdown", startCropPointer);
  elements.imageCropCanvas.addEventListener("pointermove", moveCropPointer);
  elements.imageCropCanvas.addEventListener("pointerup", endCropPointer);
  elements.imageCropCanvas.addEventListener("pointercancel", endCropPointer);
  elements.imageCropCanvas.addEventListener("pointerleave", endCropPointer);
  elements.imageCropModal.addEventListener("click", (event) => {
    if (event.target === elements.imageCropModal) {
      cancelImageCrop();
    }
  });
}

export async function openImageCropModal(source) {
  const image = await loadImageFromSource(source);
  cropState.image = image;
  cropState.fileName = getSourceFileName(source);
  cropState.action = null;
  cropState.startPoint = null;
  cropState.startCropRect = null;
  resetCropRect(image);
  openModal();
  drawCropCanvas();

  return new Promise((resolve) => {
    cropState.resolve = resolve;
  });
}

function loadImageFromSource(source) {
  if (source && typeof source.dataUrl === "string") {
    return loadImageFromDataUrl(source.dataUrl);
  }

  return loadImageFromFile(source);
}

function getSourceFileName(source) {
  if (source && typeof source.fileName === "string" && source.fileName.trim()) {
    return source.fileName;
  }

  return source?.name || "image.jpg";
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      image.src = reader.result;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    image.src = dataUrl;
  });
}

function openModal() {
  elements.imageCropModal.classList.remove("hidden");
  elements.imageCropModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  elements.imageCropModal.classList.add("hidden");
  elements.imageCropModal.setAttribute("aria-hidden", "true");
}

function resolveCrop(result) {
  const resolve = cropState.resolve;
  cropState.resolve = null;
  closeModal();
  if (resolve) resolve(result);
}

function cancelImageCrop() {
  resolveCrop(null);
}

function useWholeImage() {
  resolveCrop({ useWholeImage: true });
}

function resetCropToCenter() {
  if (!cropState.image) return;
  resetCropRect(cropState.image);
  drawCropCanvas();
}

function resetCropRect(image) {
  const width = Math.max(MIN_CROP_SIZE, Math.round(image.width * 0.8));
  const height = Math.max(MIN_CROP_SIZE, Math.round(image.height * 0.8));
  cropState.cropRect = {
    x: Math.round((image.width - width) / 2),
    y: Math.round((image.height - height) / 2),
    width,
    height
  };
}

function startCropPointer(event) {
  if (!cropState.image || !cropState.cropRect) return;
  const point = getImagePointFromEvent(event);
  if (!point) return;

  if (isInResizeHandle(point.canvasX, point.canvasY)) {
    cropState.action = "resize";
  } else if (isInCropRect(point.x, point.y)) {
    cropState.action = "move";
  } else {
    return;
  }

  cropState.startPoint = point;
  cropState.startCropRect = { ...cropState.cropRect };
  if (elements.imageCropCanvas.setPointerCapture) {
    elements.imageCropCanvas.setPointerCapture(event.pointerId);
  }
}

function moveCropPointer(event) {
  if (!cropState.action || !cropState.startPoint || !cropState.startCropRect) return;
  const point = getImagePointFromEvent(event);
  if (!point) return;

  if (cropState.action === "move") {
    moveCropRect(point);
  }

  if (cropState.action === "resize") {
    resizeCropRect(point);
  }

  drawCropCanvas();
}

function endCropPointer(event) {
  cropState.action = null;
  cropState.startPoint = null;
  cropState.startCropRect = null;
  if (elements.imageCropCanvas.hasPointerCapture &&
      elements.imageCropCanvas.hasPointerCapture(event.pointerId)) {
    elements.imageCropCanvas.releasePointerCapture(event.pointerId);
  }
}

function moveCropRect(point) {
  const source = cropState.startCropRect;
  const dx = point.x - cropState.startPoint.x;
  const dy = point.y - cropState.startPoint.y;
  cropState.cropRect = {
    ...source,
    x: clamp(source.x + dx, 0, cropState.image.width - source.width),
    y: clamp(source.y + dy, 0, cropState.image.height - source.height)
  };
}

function resizeCropRect(point) {
  const source = cropState.startCropRect;
  const width = clamp(point.x - source.x, MIN_CROP_SIZE, cropState.image.width - source.x);
  const height = clamp(point.y - source.y, MIN_CROP_SIZE, cropState.image.height - source.y);
  cropState.cropRect = {
    ...source,
    width,
    height
  };
}

async function applyImageCrop() {
  if (!cropState.image || !cropState.cropRect) return;
  const dataUrl = createCroppedDataUrl();
  resolveCrop({
    useWholeImage: false,
    dataUrl,
    fileName: cropState.fileName
  });
}

function createCroppedDataUrl() {
  const crop = roundCropRect(cropState.cropRect);
  const targetSize = calculateImageSize(crop.width, crop.height);
  const canvas = document.createElement("canvas");
  canvas.width = targetSize.width;
  canvas.height = targetSize.height;

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    cropState.image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    targetSize.width,
    targetSize.height
  );

  return canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
}

function drawCropCanvas() {
  const canvas = elements.imageCropCanvas;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111820";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (!cropState.image || !cropState.cropRect) return;

  const imageRect = calculateCanvasImageRect(canvas, cropState.image);
  cropState.imageRect = imageRect;
  context.drawImage(cropState.image, imageRect.x, imageRect.y, imageRect.width, imageRect.height);

  const crop = imageRectToCanvasRect(cropState.cropRect, imageRect);
  drawOverlay(context, canvas, crop);
  drawCropFrame(context, crop);
}

function drawOverlay(context, canvas, crop) {
  context.save();
  context.fillStyle = "rgba(0, 0, 0, 0.55)";
  context.beginPath();
  context.rect(0, 0, canvas.width, canvas.height);
  context.rect(crop.x, crop.y, crop.width, crop.height);
  context.fill("evenodd");
  context.restore();
}

function drawCropFrame(context, crop) {
  context.save();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.setLineDash([8, 6]);
  context.strokeRect(crop.x, crop.y, crop.width, crop.height);
  context.setLineDash([]);
  context.fillStyle = "#ffffff";
  context.fillRect(
    crop.x + crop.width - CROP_HANDLE_SIZE,
    crop.y + crop.height - CROP_HANDLE_SIZE,
    CROP_HANDLE_SIZE,
    CROP_HANDLE_SIZE
  );
  context.strokeStyle = "#111820";
  context.lineWidth = 2;
  context.strokeRect(
    crop.x + crop.width - CROP_HANDLE_SIZE,
    crop.y + crop.height - CROP_HANDLE_SIZE,
    CROP_HANDLE_SIZE,
    CROP_HANDLE_SIZE
  );
  context.restore();
}

function getImagePointFromEvent(event) {
  const canvas = elements.imageCropCanvas;
  const rect = canvas.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) * (canvas.width / rect.width);
  const canvasY = (event.clientY - rect.top) * (canvas.height / rect.height);
  const imageRect = cropState.imageRect || calculateCanvasImageRect(canvas, cropState.image);
  return {
    canvasX,
    canvasY,
    x: clamp((canvasX - imageRect.x) / imageRect.scale, 0, cropState.image.width),
    y: clamp((canvasY - imageRect.y) / imageRect.scale, 0, cropState.image.height)
  };
}

function calculateCanvasImageRect(canvas, image) {
  const availableWidth = canvas.width - CROP_MARGIN * 2;
  const availableHeight = canvas.height - CROP_MARGIN * 2;
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: Math.round((canvas.width - width) / 2),
    y: Math.round((canvas.height - height) / 2),
    width,
    height,
    scale
  };
}

function imageRectToCanvasRect(rect, imageRect) {
  return {
    x: imageRect.x + rect.x * imageRect.scale,
    y: imageRect.y + rect.y * imageRect.scale,
    width: rect.width * imageRect.scale,
    height: rect.height * imageRect.scale
  };
}

function isInCropRect(x, y) {
  const crop = cropState.cropRect;
  return x >= crop.x && x <= crop.x + crop.width && y >= crop.y && y <= crop.y + crop.height;
}

function isInResizeHandle(canvasX, canvasY) {
  const crop = imageRectToCanvasRect(cropState.cropRect, cropState.imageRect);
  return canvasX >= crop.x + crop.width - CROP_HANDLE_SIZE * 1.5 &&
    canvasX <= crop.x + crop.width + CROP_HANDLE_SIZE &&
    canvasY >= crop.y + crop.height - CROP_HANDLE_SIZE * 1.5 &&
    canvasY <= crop.y + crop.height + CROP_HANDLE_SIZE;
}

function calculateImageSize(width, height) {
  const ratio = Math.min(IMAGE_MAX_SIZE / width, IMAGE_MAX_SIZE / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

function roundCropRect(rect) {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
