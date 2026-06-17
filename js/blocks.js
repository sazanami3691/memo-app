"use strict";

import { deleteAssetIfUnused } from "./assets.js";
import { renderDrawingBlock, insertDrawingBlockAfter, renderPreviewDrawingBlock } from "./drawingBlocks.js";
import { renderImageBlock, insertImageBlockAfter, renderPreviewImageBlock } from "./imageBlocks.js";
import { getSelectedNote, renderBlockList, saveCurrentNote, scheduleAutoSave } from "./notes.js";
import { elements } from "./state.js";
import { createEmptyList, createId } from "./utils.js";

export function createTextBlock(text) {
  return {
    id: createId("block"),
    type: "text",
    text
  };
}

export function renderBlock(block, index, blockCount) {
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

export function renderPreviewBlock(block) {
  if (block.type === "text") {
    return renderPreviewTextBlock(block);
  }

  if (block.type === "image") {
    return renderPreviewImageBlock(block);
  }

  if (block.type === "drawing") {
    return renderPreviewDrawingBlock(block);
  }

  return createEmptyList(`未対応ブロック: ${block.type}`);
}

export function renderPreviewTextBlock(block) {
  const text = document.createElement("div");
  text.className = "preview-text";
  text.textContent = block.text || "";
  return text;
}

export function renderTextBlock(block, index, blockCount) {
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

export function createBlockControls(block, index, blockCount) {
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

export function createBlockInsertActions(blockId) {
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

export function addTextBlock() {
  const note = getSelectedNote();
  if (!note) return;

  // 閲覧モード追加時は、ここを「編集用ブロック操作」として分離しやすくしておく。
  note.blocks.push(createTextBlock(""));
  renderBlockList(note);
  scheduleAutoSave();
  focusLastTextBlock();
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

function focusLastTextBlock() {
  const textareas = elements.blockList.querySelectorAll("textarea");
  const lastTextarea = textareas[textareas.length - 1];
  if (lastTextarea) lastTextarea.focus();
}
