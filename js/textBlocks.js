"use strict";

import { scheduleAutoSave } from "./notes.js";
import { createId } from "./utils.js";

export function createTextBlock(text) {
  return {
    id: createId("block"),
    type: "text",
    text
  };
}

export function renderPreviewTextBlock(block) {
  const text = document.createElement("div");
  text.className = "preview-text";
  text.textContent = block.text || "";
  return text;
}

export function renderTextBlock(block, controls, insertActions) {
  const wrapper = document.createElement("section");
  wrapper.className = "text-block";

  wrapper.append(controls, insertActions);

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
