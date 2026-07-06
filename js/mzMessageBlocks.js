"use strict";

import { scheduleAutoSave } from "./notes.js";
import { state } from "./state.js";
import { createId } from "./utils.js";

const MZ_MESSAGE_LINE_LIMIT = 4;
const MZ_MESSAGE_CHAR_LIMIT = 30;

export function createMzMessageBlock(text = "") {
  return {
    id: createId("block"),
    type: "mzMessage",
    speakerName: "",
    text
  };
}

export function renderMzMessageBlock(block, controls, insertActions) {
  const wrapper = document.createElement("section");
  wrapper.className = "mz-message-block";

  wrapper.append(controls, insertActions);

  const help = document.createElement("div");
  help.className = "mz-message-help";
  help.textContent = `1行${MZ_MESSAGE_CHAR_LIMIT}文字・最大${MZ_MESSAGE_LINE_LIMIT}行目安。超過しても入力内容は保持されます。`;

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
      hasLineWarning ? `${MZ_MESSAGE_CHAR_LIMIT}文字を超えた行があります。` : "",
      hasLineCountWarning ? `${MZ_MESSAGE_LINE_LIMIT}行を超えています。` : ""
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
