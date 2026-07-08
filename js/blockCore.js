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
import { elements } from "./state.js";
import { createTextBlock, renderPreviewTextBlock, renderTextBlock } from "./textBlocks.js";
import { createEmptyList } from "./utils.js";

const blockHandlers = {
  moveBlockUp,
  moveBlockDown,
  deleteBlock,
  insertTextBlockAfter,
  insertMzMessageBlockAfter,
  insertImageBlockAfter,
  insertDrawingBlockAfter
};

export function renderBlock(block, index, blockCount) {
  if (block.type === "text") {
    return renderTextBlock(
      block,
      createBlockControls(block, index, blockCount),
      createBlockInsertActions(block.id)
    );
  }

  if (block.type === "mzMessage") {
    return renderMzMessageBlock(
      block,
      createBlockControls(block, index, blockCount),
      createBlockInsertActions(block.id)
    );
  }

  if (block.type === "image") {
    return renderImageBlock(block, index, blockCount);
  }

  if (block.type === "drawing") {
    return renderDrawingBlock(block, index, blockCount);
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
  note.blocks.push(createTextBlock(""));
  renderBlockList(note);
  scheduleAutoSave();
  focusLastEditableBlock();
}

export function addMzMessageBlock() {
  const note = getSelectedNote();
  if (!note) return;

  note.blocks.push(createMzMessageBlock(""));
  renderBlockList(note);
  scheduleAutoSave();
  focusLastEditableBlock();
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

function focusLastEditableBlock() {
  const textareas = elements.blockList.querySelectorAll("textarea");
  const lastTextarea = textareas[textareas.length - 1];
  if (lastTextarea) lastTextarea.focus();
}
