"use strict";

import { createBlockControls, createBlockInsertActions, insertBlock } from "./blocks.js";
import { createMissingAssetMessage, getAssetById } from "./assets.js";
import { saveAsset } from "./db.js";
import { openImageModal } from "./imageBlocks.js";
import { saveCurrentNote, scheduleAutoSave, setSaveStatus } from "./notes.js";
import {
  DRAWING_HEIGHT,
  DRAWING_SIZES,
  DRAWING_WIDTH,
  appActions,
  elements,
  state
} from "./state.js";
import { createId } from "./utils.js";

export function createDrawingBlock(assetId) {
  return {
    id: createId("block"),
    type: "drawing",
    assetId,
    caption: ""
  };
}

export function addDrawingBlock() {
  state.pendingDrawingInsertAfterBlockId = null;
  openDrawingModal({
    assetId: null,
    afterBlockId: null
  });
}

export function insertDrawingBlockAfter(blockId) {
  state.pendingDrawingInsertAfterBlockId = blockId;
  openDrawingModal({
    assetId: null,
    afterBlockId: blockId
  });
}

export function renderDrawingBlock(block, index, blockCount) {
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

export function renderPreviewDrawingBlock(block) {
  const asset = getAssetById(block.assetId);
  if (!asset) {
    return createPreviewMissingAsset("手書きデータが見つかりません");
  }

  const wrapper = document.createElement("figure");
  wrapper.className = "preview-drawing-wrap";

  const image = document.createElement("img");
  image.className = "preview-drawing";
  image.src = asset.dataUrl;
  image.alt = block.caption || "手書きメモ";
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

export async function openDrawingModal(options = {}) {
  if (!state.selectedNoteId) return;

  state.editingDrawingAssetId = options.assetId || null;
  state.pendingDrawingInsertAfterBlockId = options.afterBlockId || null;
  state.drawingMode = "pen";
  state.drawingSize = DRAWING_SIZES.medium;
  state.drawingStrokes = [];
  state.drawingRedoStack = [];
  state.currentDrawingStroke = null;
  state.isDrawing = false;
  state.baseDrawingDataUrl = null;

  setupDrawingCanvas();
  updateDrawingToolbarState();

  if (state.editingDrawingAssetId) {
    const asset = getAssetById(state.editingDrawingAssetId);
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

export function closeDrawingModal() {
  elements.drawingModal.classList.add("hidden");
  elements.drawingModal.setAttribute("aria-hidden", "true");
  state.editingDrawingAssetId = null;
  state.pendingDrawingInsertAfterBlockId = null;
  state.currentDrawingStroke = null;
  state.isDrawing = false;
}

export function setupDrawingCanvas() {
  const canvas = elements.drawingCanvas;
  canvas.width = DRAWING_WIDTH;
  canvas.height = DRAWING_HEIGHT;
  state.drawingContext = canvas.getContext("2d");
  state.drawingContext.lineCap = "round";
  state.drawingContext.lineJoin = "round";
  fillDrawingCanvasWhite();
}

export function startDrawing(event) {
  if (elements.drawingModal.classList.contains("hidden")) return;

  event.preventDefault();
  elements.drawingCanvas.setPointerCapture(event.pointerId);
  state.isDrawing = true;
  const point = getCanvasPoint(event);
  state.currentDrawingStroke = {
    mode: state.drawingMode,
    size: state.drawingSize,
    color: state.drawingMode === "eraser" ? "#ffffff" : "#000000",
    points: [point]
  };
  drawStrokeDot(state.currentDrawingStroke, point);
}

export function continueDrawing(event) {
  if (!state.isDrawing || !state.currentDrawingStroke) return;

  event.preventDefault();
  const point = getCanvasPoint(event);
  const previousPoint = state.currentDrawingStroke.points[state.currentDrawingStroke.points.length - 1];
  state.currentDrawingStroke.points.push(point);
  drawStrokeSegment(state.currentDrawingStroke, previousPoint, point);
}

export function endDrawing(event) {
  if (!state.isDrawing || !state.currentDrawingStroke) return;

  event.preventDefault();
  if (elements.drawingCanvas.hasPointerCapture(event.pointerId)) {
    elements.drawingCanvas.releasePointerCapture(event.pointerId);
  }

  state.drawingStrokes.push(state.currentDrawingStroke);
  state.drawingRedoStack = [];
  state.currentDrawingStroke = null;
  state.isDrawing = false;
}

export function redrawCanvasFromStrokes() {
  fillDrawingCanvasWhite();

  if (state.baseDrawingDataUrl) {
    const image = new Image();
    image.onload = () => {
      state.drawingContext.drawImage(image, 0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
      state.drawingStrokes.forEach(drawStrokeOperation);
    };
    image.src = state.baseDrawingDataUrl;
    return;
  }

  state.drawingStrokes.forEach(drawStrokeOperation);
}

export function clearDrawingCanvas() {
  state.drawingStrokes.push({
    type: "clear"
  });
  state.drawingRedoStack = [];
  redrawCanvasFromStrokes();
}

export function undoDrawing() {
  if (state.drawingStrokes.length === 0) return;

  const stroke = state.drawingStrokes.pop();
  state.drawingRedoStack.push(stroke);
  redrawCanvasFromStrokes();
}

export function redoDrawing() {
  if (state.drawingRedoStack.length === 0) return;

  const stroke = state.drawingRedoStack.pop();
  state.drawingStrokes.push(stroke);
  redrawCanvasFromStrokes();
}

export async function saveDrawingFromCanvas() {
  const dataUrl = elements.drawingCanvas.toDataURL("image/png");

  try {
    setSaveStatus("保存中...", "saving");

    if (state.editingDrawingAssetId) {
      await updateDrawingAsset(state.editingDrawingAssetId, dataUrl, DRAWING_WIDTH, DRAWING_HEIGHT);
    } else {
      const asset = await createDrawingAsset(dataUrl, DRAWING_WIDTH, DRAWING_HEIGHT);
      const block = createDrawingBlock(asset.id);
      insertBlock(block, state.pendingDrawingInsertAfterBlockId);
    }

    closeDrawingModal();
    appActions.renderAll();
    await saveCurrentNote();
  } catch (error) {
    console.error(error);
    alert("手書きメモの保存に失敗しました。");
    setSaveStatus("保存エラー", "error");
  }
}

export async function createDrawingAsset(dataUrl, width, height) {
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
  state.assets.push(asset);
  return asset;
}

export async function updateDrawingAsset(assetId, dataUrl, width, height) {
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

export function loadDrawingAssetToCanvas(asset) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      fillDrawingCanvasWhite();
      state.drawingContext.drawImage(image, 0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
      state.baseDrawingDataUrl = elements.drawingCanvas.toDataURL("image/png");
      resolve();
    };
    image.onerror = () => reject(new Error("手書きデータを読み込めませんでした。"));
    image.src = asset.dataUrl;
  });
}

function fillDrawingCanvasWhite() {
  state.drawingContext.fillStyle = "#ffffff";
  state.drawingContext.fillRect(0, 0, DRAWING_WIDTH, DRAWING_HEIGHT);
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
  state.drawingContext.strokeStyle = stroke.color;
  state.drawingContext.lineWidth = stroke.size;
  state.drawingContext.beginPath();
  state.drawingContext.moveTo(fromPoint.x, fromPoint.y);
  state.drawingContext.lineTo(toPoint.x, toPoint.y);
  state.drawingContext.stroke();
}

function drawStrokeDot(stroke, point) {
  state.drawingContext.fillStyle = stroke.color;
  state.drawingContext.beginPath();
  state.drawingContext.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
  state.drawingContext.fill();
}

export function setDrawingMode(mode) {
  state.drawingMode = mode;
  updateDrawingToolbarState();
}

export function setDrawingSize(size) {
  state.drawingSize = size;
  updateDrawingToolbarState();
}

export function updateDrawingToolbarState() {
  elements.drawingPenButton.classList.toggle("active-tool", state.drawingMode === "pen");
  elements.drawingEraserButton.classList.toggle("active-tool", state.drawingMode === "eraser");
  elements.drawingSizeSmallButton.classList.toggle("active-tool", state.drawingSize === DRAWING_SIZES.small);
  elements.drawingSizeMediumButton.classList.toggle("active-tool", state.drawingSize === DRAWING_SIZES.medium);
  elements.drawingSizeLargeButton.classList.toggle("active-tool", state.drawingSize === DRAWING_SIZES.large);
}
