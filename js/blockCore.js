"use strict";

import {
  createBlockControls as createBlockControlsElement,
  createBlockInsertActions as createBlockInsertActionsElement
} from "./blockControls.js";
import { deleteAssetIfUnused } from "./assets.js";
import { renderDrawingBlock, insertDrawingBlockAfter, renderPreviewDrawingBlock } from "./drawingBlocks.js";
import { renderImageBlock, insertImageBlockAfter, renderPreviewImageBlock } from "./imageBlocks.js";
import { createMzMessageBlock, renderMzMessageBlock, renderPreviewMzMessageBlock } from "./mzMessageBlocks.js";
import { getSelectedNote, renderBlockList, saveCurrentNote, scheduleAutoSave } from "./notes.js";
import { appActions, elements, state } from "./state.js";
import { createTextBlock, renderPreviewTextBlock, renderTextBlock } from "./textBlocks.js";
import { createEmptyList } from "./utils.js";

const BLOCK_DRAG_LONG_PRESS_MS = 300;
const BLOCK_DRAG_MOUSE_MOVE_THRESHOLD = 6;

let blockDragState = null;

const blockHandlers = {
  moveBlockUp,
  moveBlockDown,
  deleteBlock,
  startBlockDrag,
  insertTextBlockAfter,
  insertMzMessageBlockAfter,
  insertImageBlockAfter,
  insertReusableImageBlockAfter,
  insertDrawingBlockAfter
};

export function renderBlock(block, index, blockCount) {
  let element;

  if (block.type === "text") {
    element = renderTextBlock(
      block,
      createBlockControls(block, index, blockCount),
      createBlockInsertActions(block.id)
    );
    return prepareBlockElement(element, block);
  }

  if (block.type === "mzMessage") {
    element = renderMzMessageBlock(
      block,
      createBlockControls(block, index, blockCount),
      createBlockInsertActions(block.id)
    );
    return prepareBlockElement(element, block);
  }

  if (block.type === "image") {
    element = renderImageBlock(block, index, blockCount);
    return prepareBlockElement(element, block);
  }

  if (block.type === "drawing") {
    element = renderDrawingBlock(block, index, blockCount);
    return prepareBlockElement(element, block);
  }

  return createEmptyList(`未対応ブロック: ${block.type}`);
}

export function renderPreviewBlock(block) {
  if (block.type === "text") {
    return renderPreviewTextBlock(block);
  }

  if (block.type === "mzMessage") {
    return renderPreviewMzMessageBlock(block);
  }

  if (block.type === "image") {
    return renderPreviewImageBlock(block);
  }

  if (block.type === "drawing") {
    return renderPreviewDrawingBlock(block);
  }

  return createEmptyList(`未対応ブロック: ${block.type}`);
}

export function createBlockControls(block, index, blockCount) {
  return createBlockControlsElement(block, index, blockCount, blockHandlers);
}

export function createBlockInsertActions(blockId) {
  return createBlockInsertActionsElement(blockId, blockHandlers);
}

export function addTextBlock() {
  const note = getSelectedNote();
  if (!note) return;

  // 閲覧モード追加時も、ここでは「編集用ブロック操作」として扱う。
  const block = createTextBlock("");
  insertBlock(block, getViewportCenterBlockId());
  state.editorMode = "edit";
  appActions.renderAll();
  scheduleAutoSave();
  focusEditableBlock(block.id);
}

export function addMzMessageBlock() {
  const note = getSelectedNote();
  if (!note) return;

  const block = createMzMessageBlock("");
  insertBlock(block, getViewportCenterBlockId());
  state.editorMode = "edit";
  appActions.renderAll();
  scheduleAutoSave();
  focusEditableBlock(block.id);
}

export function insertTextBlockAfter(blockId) {
  const note = getSelectedNote();
  if (!note) return;

  const index = note.blocks.findIndex((block) => block.id === blockId);
  const insertIndex = index === -1 ? note.blocks.length : index + 1;
  note.blocks.splice(insertIndex, 0, createTextBlock(""));
  renderBlockList(note);
  scheduleAutoSave();
}

export function insertMzMessageBlockAfter(blockId) {
  const note = getSelectedNote();
  if (!note) return;

  const index = note.blocks.findIndex((block) => block.id === blockId);
  const insertIndex = index === -1 ? note.blocks.length : index + 1;
  note.blocks.splice(insertIndex, 0, createMzMessageBlock(""));
  renderBlockList(note);
  scheduleAutoSave();
}

export function insertReusableImageBlockAfter(blockId) {
  window.dispatchEvent(new CustomEvent("memo:openReusableImages", {
    detail: { afterBlockId: blockId }
  }));
}

export function insertBlock(block, afterBlockId) {
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

export function getViewportCenterBlockId() {
  if (!elements.editorForm || elements.editorForm.classList.contains("hidden")) {
    return null;
  }

  const blockElements = getEditableBlockElements();
  if (blockElements.length === 0) return null;

  const viewportCenterY = window.innerHeight / 2;
  let bestElement = null;
  let bestDistance = Infinity;

  blockElements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.height === 0) return;
    const blockCenterY = rect.top + rect.height / 2;
    const distance = Math.abs(blockCenterY - viewportCenterY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestElement = element;
    }
  });

  return bestElement?.dataset.blockId || null;
}

export async function deleteBlock(blockId) {
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

export function moveBlockUp(blockId) {
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

export function moveBlockDown(blockId) {
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

export function startBlockDrag(blockId, event) {
  if (!event.isPrimary) return;
  if (event.button !== undefined && event.button !== 0) return;

  const sourceElement = getBlockElementById(blockId);
  if (!sourceElement) return;

  event.preventDefault();
  event.stopPropagation();
  sourceElement.setPointerCapture?.(event.pointerId);

  blockDragState = {
    blockId,
    sourceElement,
    pointerId: event.pointerId,
    pointerType: event.pointerType || "mouse",
    startX: event.clientX,
    startY: event.clientY,
    isDragging: false,
    dropIndex: null,
    longPressTimer: window.setTimeout(() => beginBlockDrag(), BLOCK_DRAG_LONG_PRESS_MS)
  };

  window.addEventListener("pointermove", handleBlockDragMove, { passive: false });
  window.addEventListener("pointerup", finishBlockDrag, { passive: false });
  window.addEventListener("pointercancel", cancelBlockDrag, { passive: false });
}

function handleBlockDragMove(event) {
  if (!blockDragState || event.pointerId !== blockDragState.pointerId) return;

  const moveDistance = Math.hypot(
    event.clientX - blockDragState.startX,
    event.clientY - blockDragState.startY
  );

  if (!blockDragState.isDragging) {
    if (blockDragState.pointerType === "mouse" && moveDistance > BLOCK_DRAG_MOUSE_MOVE_THRESHOLD) {
      beginBlockDrag();
    } else {
      return;
    }
  }

  event.preventDefault();
  updateBlockDropIndicator(event.clientY);
}

function beginBlockDrag() {
  if (!blockDragState || blockDragState.isDragging) return;

  window.clearTimeout(blockDragState.longPressTimer);
  blockDragState.isDragging = true;
  blockDragState.sourceElement.classList.add("is-dragging");
  document.body.classList.add("block-drag-active");
  blockDragState.indicator = createBlockDropIndicator();
  updateBlockDropIndicator(blockDragState.startY);
}

function finishBlockDrag(event) {
  if (!blockDragState || event.pointerId !== blockDragState.pointerId) return;

  if (blockDragState.isDragging) {
    event.preventDefault();
    applyBlockDragDrop();
  }
  cleanupBlockDrag();
}

function cancelBlockDrag(event) {
  if (!blockDragState || event.pointerId !== blockDragState.pointerId) return;
  cleanupBlockDrag();
}

function applyBlockDragDrop() {
  const note = getSelectedNote();
  if (!note || blockDragState.dropIndex === null) return;

  const oldIndex = note.blocks.findIndex((block) => block.id === blockDragState.blockId);
  if (oldIndex === -1) return;

  let newIndex = blockDragState.dropIndex;
  if (newIndex > oldIndex) {
    newIndex -= 1;
  }
  newIndex = Math.max(0, Math.min(newIndex, note.blocks.length - 1));
  if (newIndex === oldIndex) return;

  const [movedBlock] = note.blocks.splice(oldIndex, 1);
  note.blocks.splice(newIndex, 0, movedBlock);
  renderBlockList(note);
  scheduleAutoSave();
}

function updateBlockDropIndicator(clientY) {
  if (!blockDragState?.indicator) return;

  const blockElements = getEditableBlockElements();
  const otherBlockElements = blockElements.filter((element) => element.dataset.blockId !== blockDragState.blockId);
  let beforeElement = null;

  for (const element of otherBlockElements) {
    const rect = element.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      beforeElement = element;
      break;
    }
  }

  if (beforeElement) {
    elements.blockList.insertBefore(blockDragState.indicator, beforeElement);
    blockDragState.dropIndex = blockElements.indexOf(beforeElement);
  } else {
    elements.blockList.appendChild(blockDragState.indicator);
    blockDragState.dropIndex = blockElements.length;
  }
}

function cleanupBlockDrag() {
  if (!blockDragState) return;

  window.clearTimeout(blockDragState.longPressTimer);
  blockDragState.sourceElement.classList.remove("is-dragging");
  blockDragState.sourceElement.releasePointerCapture?.(blockDragState.pointerId);
  blockDragState.indicator?.remove();
  document.body.classList.remove("block-drag-active");
  window.removeEventListener("pointermove", handleBlockDragMove);
  window.removeEventListener("pointerup", finishBlockDrag);
  window.removeEventListener("pointercancel", cancelBlockDrag);
  blockDragState = null;
}

function prepareBlockElement(element, block) {
  element.classList.add("block-card");
  element.dataset.blockId = block.id;
  return element;
}

function createBlockDropIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "block-drop-indicator";
  return indicator;
}

function getEditableBlockElements() {
  return Array.from(elements.blockList.querySelectorAll(".block-card[data-block-id]"));
}

function getBlockElementById(blockId) {
  return getEditableBlockElements().find((element) => element.dataset.blockId === blockId) || null;
}

function focusEditableBlock(blockId) {
  requestAnimationFrame(() => {
    const blockElement = getBlockElementById(blockId);
    const target = blockElement?.querySelector("textarea, input");
    if (target) target.focus();
  });
}
