"use strict";

import { deleteAssetIfUnused } from "./assets.js";
import { renderDrawingBlock, insertDrawingBlockAfter, renderPreviewDrawingBlock } from "./drawingBlocks.js";
import { renderImageBlock, insertImageBlockAfter, renderPreviewImageBlock } from "./imageBlocks.js";
import { getSelectedNote, renderBlockList, saveCurrentNote, scheduleAutoSave } from "./notes.js";
import { elements, state } from "./state.js";
import { createEmptyList, createId } from "./utils.js";

const MZ_MESSAGE_LINE_LIMIT = 4;
const MZ_MESSAGE_CHAR_LIMIT = 33;

export function createTextBlock(text) {
  return {
    id: createId("block"),
    type: "text",
    text
  };
}

export function createMzMessageBlock(text = "") {
  return {
    id: createId("block"),
    type: "mzMessage",
    speakerName: "",
    text
  };
}

export function renderBlock(block, index, blockCount) {
  if (block.type === "text") {
    return renderTextBlock(block, index, blockCount);
  }

  if (block.type === "mzMessage") {
    return renderMzMessageBlock(block, index, blockCount);
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

export function renderMzMessageBlock(block, index, blockCount) {
  const wrapper = document.createElement("section");
  wrapper.className = "mz-message-block";

  wrapper.append(
    createBlockControls(block, index, blockCount),
    createBlockInsertActions(block.id)
  );

  const help = document.createElement("div");
  help.className = "mz-message-help";
  help.textContent = "1行33文字・最大4行目安。超過しても入力内容は保持されます。";

  const speakerField = document.createElement("label");
  speakerField.className = "mz-message-speaker-field";

  const speakerLabel = document.createElement("span");
  speakerLabel.className = "field-label";
  speakerLabel.textContent = "セリフ主";

  const speakerInput = document.createElement("input");
  speakerInput.className = "mz-message-speaker-input";
  speakerInput.type = "text";
  speakerInput.value = block.speakerName || "";
  speakerInput.placeholder = "例: アリア";
  speakerInput.addEventListener("input", () => {
    block.speakerName = speakerInput.value;
    scheduleAutoSave();
  });

  speakerField.append(speakerLabel, speakerInput);

  const bodyLabel = document.createElement("div");
  bodyLabel.className = "field-label";
  bodyLabel.textContent = "本文";

  const editorWrap = document.createElement("div");
  editorWrap.className = "mz-message-editor-wrap";

  const guideMeasure = document.createElement("span");
  guideMeasure.className = "mz-message-guide-measure";
  guideMeasure.textContent = "あ".repeat(MZ_MESSAGE_CHAR_LIMIT);

  const textarea = document.createElement("textarea");
  textarea.className = "mz-message-editor";
  textarea.value = block.text || "";
  textarea.placeholder = "MZの文章を入力";

  const stats = document.createElement("div");
  stats.className = "mz-message-stats";

  const updateStats = () => renderMzMessageStats(stats, textarea.value);
  textarea.addEventListener("input", () => {
    block.text = textarea.value;
    updateStats();
    scheduleAutoSave();
  });

  editorWrap.append(guideMeasure, textarea);
  wrapper.append(help, speakerField, bodyLabel, editorWrap, stats);
  updateStats();
  updateMzLineGuide(editorWrap, guideMeasure);
  return wrapper;
}

export function renderPreviewMzMessageBlock(block) {
  const isWindowMode = state.mzDisplayMode !== "normal";
  const wrapper = document.createElement("section");
  wrapper.className = `preview-mz-message ${isWindowMode ? "window-mode" : "normal-mode"}`;

  if (block.speakerName) {
    const speaker = document.createElement("div");
    speaker.className = "preview-mz-message-speaker";
    speaker.textContent = block.speakerName;
    wrapper.appendChild(speaker);
  }

  const text = document.createElement("div");
  text.className = "preview-mz-message-text";
  text.textContent = block.text || "";
  wrapper.appendChild(text);
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

  const addMzMessageButton = document.createElement("button");
  addMzMessageButton.type = "button";
  addMzMessageButton.textContent = "下にMZ文章追加";
  addMzMessageButton.addEventListener("click", () => insertMzMessageBlockAfter(blockId));

  const addImageButton = document.createElement("button");
  addImageButton.type = "button";
  addImageButton.textContent = "下に画像追加";
  addImageButton.addEventListener("click", () => insertImageBlockAfter(blockId));

  const addDrawingButton = document.createElement("button");
  addDrawingButton.type = "button";
  addDrawingButton.textContent = "下に手書き追加";
  addDrawingButton.addEventListener("click", () => insertDrawingBlockAfter(blockId));

  actions.append(addTextButton, addMzMessageButton, addImageButton, addDrawingButton);
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

function focusLastTextBlock() {
  const textareas = elements.blockList.querySelectorAll("textarea");
  const lastTextarea = textareas[textareas.length - 1];
  if (lastTextarea) lastTextarea.focus();
}

function focusLastEditableBlock() {
  const textareas = elements.blockList.querySelectorAll("textarea");
  const lastTextarea = textareas[textareas.length - 1];
  if (lastTextarea) lastTextarea.focus();
}

function renderMzMessageStats(container, text) {
  const lines = splitMzMessageLines(text);
  const hasLineWarning = lines.some((line) => countCharacters(line) > MZ_MESSAGE_CHAR_LIMIT);
  const hasLineCountWarning = lines.length > MZ_MESSAGE_LINE_LIMIT;
  container.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = `mz-message-summary${hasLineCountWarning ? " warning" : ""}`;
  summary.textContent = `${lines.length}行 / 最大${MZ_MESSAGE_LINE_LIMIT}行目安`;
  container.appendChild(summary);

  const list = document.createElement("div");
  list.className = "mz-message-line-counts";
  lines.forEach((line, index) => {
    const count = countCharacters(line);
    const item = document.createElement("span");
    item.className = `mz-message-line-count${count > MZ_MESSAGE_CHAR_LIMIT ? " warning" : ""}`;
    item.textContent = `${index + 1}行目: ${count}/${MZ_MESSAGE_CHAR_LIMIT}`;
    list.appendChild(item);
  });
  container.appendChild(list);

  if (hasLineWarning || hasLineCountWarning) {
    const warning = document.createElement("div");
    warning.className = "mz-message-warning";
    warning.textContent = [
      hasLineWarning ? "33文字を超えた行があります。" : "",
      hasLineCountWarning ? "4行を超えています。" : ""
    ].filter(Boolean).join(" ");
    container.appendChild(warning);
  }
}

function splitMzMessageLines(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  return normalized.split("\n");
}

function countCharacters(text) {
  return Array.from(text || "").length;
}

function updateMzLineGuide(editorWrap, guideMeasure) {
  requestAnimationFrame(() => {
    const width = guideMeasure.getBoundingClientRect().width;
    if (width > 0) {
      editorWrap.style.setProperty("--mz-line-guide-left", `${Math.ceil(width)}px`);
    }
  });
}
