import assert from "node:assert/strict";
import { appActions, elements, state, VOICE_MEMO_MODE_STORAGE_KEY } from "../js/state.js";
import {
  collectSpeechTranscript,
  enterVoiceMemoMode,
  initializeVoiceMemo,
  renderVoiceMemo
} from "../js/voiceMemo.js";

class FakeButton {
  addEventListener(type, handler) {
    if (type === "click") this.onClick = handler;
  }

  click() {
    if (!this.disabled) this.onClick?.();
  }
}

class FakeRecognition {
  static instances = [];

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    this.onstart?.();
  }

  stop() {
    this.onend?.();
  }

  abort() {
    this.onend?.();
  }

  result(text, isFinal = true) {
    this.onresult?.({ results: [{ 0: { transcript: text }, isFinal }] });
  }

  error(code) {
    this.onerror?.({ error: code });
  }
}

const storageValues = new Map();
const storage = {
  getItem: (key) => storageValues.get(key) ?? null,
  setItem: (key, value) => storageValues.set(key, value)
};
const classes = new Set();
globalThis.document = {
  body: {
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  },
  addEventListener() {}
};

elements.voiceMemoBar = { hidden: true };
elements.voiceMemoTitle = { textContent: "", title: "" };
elements.voiceMemoStartButton = new FakeButton();
elements.voiceMemoStatus = { textContent: "" };
elements.voiceMemoPreview = { textContent: "", title: "" };
elements.voiceMemoStopButton = new FakeButton();
elements.voiceMemoExitButton = new FakeButton();

const note = { id: "note_test", title: "作画", blocks: [], updatedAt: 1 };
state.notes = [note];
state.selectedNoteId = null;
let failSave = false;
const savedNotes = [];
appActions.renderAll = renderVoiceMemo;
initializeVoiceMemo({
  SpeechRecognitionClass: FakeRecognition,
  storage,
  saveNoteFn: async (value) => {
    if (failSave) throw new Error("test save failure");
    savedNotes.push(structuredClone(value));
  }
});

assert.equal(collectSpeechTranscript([
  { 0: { transcript: "最初" }, isFinal: true },
  { 0: { transcript: "途中" }, isFinal: false }
]), "最初 途中");

enterVoiceMemoMode();
assert.equal(storage.getItem(VOICE_MEMO_MODE_STORAGE_KEY), "true");
assert.equal(elements.voiceMemoStartButton.disabled, true);
assert.match(elements.voiceMemoStatus.textContent, /先に保存先のメモ/);
state.selectedNoteId = note.id;
renderVoiceMemo();
elements.voiceMemoStartButton.click();
elements.voiceMemoStartButton.click();
assert.equal(FakeRecognition.instances.length, 1);
assert.equal(FakeRecognition.instances[0].lang, "ja-JP");
FakeRecognition.instances[0].result("描き込みを増やす", false);
assert.equal(elements.voiceMemoPreview.textContent, "描き込みを増やす");
assert.match(elements.voiceMemoStatus.textContent, /音声認識中/);
FakeRecognition.instances[0].result("描き込みを増やす");
elements.voiceMemoStopButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(note.blocks.length, 1);
assert.equal(note.blocks[0].type, "text");
assert.equal(note.blocks[0].text, "描き込みを増やす");
assert.equal(savedNotes.length, 1);
assert.equal(elements.voiceMemoPreview.textContent, "");
assert.equal(elements.voiceMemoStatus.textContent, "保存しました");

elements.voiceMemoStartButton.click();
FakeRecognition.instances[1].error("not-allowed");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(elements.voiceMemoStatus.textContent, /マイクの使用が許可されていません/);
assert.equal(note.blocks.length, 1);

failSave = true;
elements.voiceMemoStartButton.click();
FakeRecognition.instances[2].result("後で直す");
const originalConsoleError = console.error;
console.error = () => {};
elements.voiceMemoStopButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
console.error = originalConsoleError;
assert.equal(note.blocks.length, 1);
assert.equal(elements.voiceMemoPreview.textContent, "後で直す");
assert.equal(elements.voiceMemoStopButton.textContent, "保存を再試行");
failSave = false;
elements.voiceMemoStopButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(note.blocks.length, 2);
assert.equal(savedNotes.length, 2);

elements.voiceMemoStartButton.click();
FakeRecognition.instances[3].result("終了時に保存");
elements.voiceMemoExitButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(state.voiceMemoMiniMode, false);
assert.equal(storage.getItem(VOICE_MEMO_MODE_STORAGE_KEY), "false");
assert.equal(note.blocks.at(-1).text, "終了時に保存");
assert.equal(classes.has("voice-memo-mini-mode"), false);

console.log("voiceMemo tests passed");
