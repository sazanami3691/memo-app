"use strict";

import { saveNote } from "./db.js";
import { scheduleAutoSave } from "./notes.js";
import { createTextBlock } from "./textBlocks.js";
import { appActions, elements, state, VOICE_MEMO_MODE_STORAGE_KEY } from "./state.js";

let recognitionClass = null;
let saveNoteForVoiceMemo = saveNote;
let modeStorage = null;
let activeRecognition = null;
let sessionNoteId = null;
let transcript = "";
let phase = "idle";
let errorMessage = "";
let stopRequested = false;
let exitAfterFinish = false;
let feedbackTimer = null;
let initialized = false;

export function collectSpeechTranscript(results) {
  const finalParts = [];
  const interimParts = [];
  for (let index = 0; index < (results?.length || 0); index += 1) {
    const result = results[index];
    const text = result?.[0]?.transcript?.trim();
    if (!text) continue;
    (result.isFinal ? finalParts : interimParts).push(text);
  }
  return [...finalParts, ...interimParts].join(" ").trim();
}

export function initializeVoiceMemo({
  SpeechRecognitionClass = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition,
  storage = globalThis.localStorage,
  saveNoteFn = saveNote
} = {}) {
  if (initialized) return;
  initialized = true;
  recognitionClass = SpeechRecognitionClass;
  saveNoteForVoiceMemo = saveNoteFn;
  modeStorage = storage;
  try {
    state.voiceMemoMiniMode = storage.getItem(VOICE_MEMO_MODE_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("作画用音声メモの表示設定を読み込めませんでした。", error);
  }

  elements.voiceMemoStartButton.addEventListener("click", startVoiceMemo);
  elements.voiceMemoStopButton.addEventListener("click", stopVoiceMemo);
  elements.voiceMemoExitButton.addEventListener("click", exitVoiceMemoMode);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && activeRecognition) stopVoiceMemo();
  });
  renderVoiceMemo();
}

export function enterVoiceMemoMode() {
  setVoiceMemoMode(true);
}

function setVoiceMemoMode(isOpen) {
  state.voiceMemoMiniMode = isOpen;
  try {
    modeStorage?.setItem(VOICE_MEMO_MODE_STORAGE_KEY, String(isOpen));
  } catch (error) {
    console.warn("作画用音声メモの表示設定を保存できませんでした。", error);
  }
  renderVoiceMemo();
}

function exitVoiceMemoMode() {
  if (activeRecognition) {
    if (phase === "starting") {
      try {
        activeRecognition.abort();
      } catch (error) {
        console.warn("音声認識の開始を中断できませんでした。", error);
      }
      activeRecognition = null;
      phase = "idle";
      transcript = "";
      setVoiceMemoMode(false);
      return;
    }
    exitAfterFinish = true;
    stopVoiceMemo();
    return;
  }
  if (phase === "saving") {
    exitAfterFinish = true;
    return;
  }
  if (phase === "error" && transcript) {
    exitAfterFinish = true;
    void saveTranscript();
    return;
  }
  setVoiceMemoMode(false);
}

function startVoiceMemo() {
  const note = state.notes.find((item) => item.id === state.selectedNoteId);
  if (!note) {
    errorMessage = "先に保存先のメモを選択してください";
    phase = "error";
    renderVoiceMemo();
    return;
  }
  if (!recognitionClass) {
    errorMessage = "この環境では音声認識を利用できません";
    phase = "error";
    renderVoiceMemo();
    return;
  }
  if (activeRecognition || phase === "saving") return;

  clearTimeout(feedbackTimer);
  transcript = "";
  errorMessage = "";
  exitAfterFinish = false;
  stopRequested = false;
  sessionNoteId = note.id;
  phase = "starting";
  try {
    const recognition = new recognitionClass();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    activeRecognition = recognition;
    recognition.onstart = () => {
      if (activeRecognition !== recognition) return;
      phase = stopRequested ? "stopping" : "listening";
      renderVoiceMemo();
      if (stopRequested) requestRecognitionStop(recognition);
    };
    recognition.onresult = (event) => {
      if (activeRecognition !== recognition) return;
      transcript = collectSpeechTranscript(event.results);
      renderVoiceMemo();
    };
    recognition.onerror = (event) => {
      if (activeRecognition !== recognition) return;
      errorMessage = getRecognitionErrorMessage(event.error);
      void finishRecognition(recognition);
    };
    recognition.onend = () => {
      if (activeRecognition === recognition) void finishRecognition(recognition);
    };
    recognition.start();
  } catch (error) {
    activeRecognition = null;
    errorMessage = "音声認識を開始できませんでした";
    phase = "error";
    console.warn("音声認識の開始に失敗しました。", error);
  }
  renderVoiceMemo();
}

function stopVoiceMemo() {
  if (phase === "error" && transcript && !activeRecognition) {
    void saveTranscript();
    return;
  }
  const recognition = activeRecognition;
  if (!recognition || stopRequested) return;
  const wasStarting = phase === "starting";
  stopRequested = true;
  phase = "stopping";
  renderVoiceMemo();
  if (!wasStarting) requestRecognitionStop(recognition);
}

function requestRecognitionStop(recognition) {
  try {
    recognition.stop();
  } catch (error) {
    console.warn("音声認識を停止できませんでした。", error);
    errorMessage = "音声認識を停止できませんでした";
    void finishRecognition(recognition);
  }
}

async function finishRecognition(recognition) {
  if (activeRecognition !== recognition) return;
  activeRecognition = null;
  stopRequested = false;
  if (transcript) {
    await saveTranscript();
    return;
  }
  phase = errorMessage ? "error" : "idle";
  renderVoiceMemo();
  if (exitAfterFinish) {
    exitAfterFinish = false;
    setVoiceMemoMode(false);
  }
}

async function saveTranscript() {
  if (phase === "saving") return;
  const text = transcript.trim();
  if (!text) return;
  const note = state.notes.find((item) => item.id === sessionNoteId);
  if (!note) {
    errorMessage = "保存先のメモが見つかりません";
    phase = "error";
    exitAfterFinish = false;
    renderVoiceMemo();
    return;
  }

  phase = "saving";
  renderVoiceMemo();
  const block = createTextBlock(text);
  const savedNote = {
    ...note,
    blocks: [...note.blocks, block],
    updatedAt: Date.now()
  };
  const hadPendingAutoSave = state.autoSaveTimer !== null;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = null;
  try {
    await saveNoteForVoiceMemo(savedNote);
  } catch (error) {
    if (hadPendingAutoSave && state.selectedNoteId === note.id) scheduleAutoSave();
    errorMessage = "保存できませんでした。再試行してください";
    phase = "error";
    exitAfterFinish = false;
    console.error("音声メモの保存に失敗しました。", error);
    renderVoiceMemo();
    return;
  }
  note.blocks = savedNote.blocks;
  note.updatedAt = savedNote.updatedAt;
  transcript = "";
  errorMessage = "";
  phase = "saved";
  appActions.renderAll();
  if (exitAfterFinish) {
    exitAfterFinish = false;
    setVoiceMemoMode(false);
  } else {
    feedbackTimer = setTimeout(() => {
      if (phase === "saved") {
        phase = "idle";
        renderVoiceMemo();
      }
    }, 2500);
  }
}

function getRecognitionErrorMessage(error) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "マイクの使用が許可されていません";
  }
  if (error === "audio-capture") return "マイクを利用できません";
  if (error === "no-speech") return "音声を認識できませんでした";
  return "音声認識でエラーが発生しました";
}

export function renderVoiceMemo() {
  if (!elements.voiceMemoBar) return;
  document.body.classList.toggle("voice-memo-mini-mode", state.voiceMemoMiniMode);
  elements.voiceMemoBar.hidden = !state.voiceMemoMiniMode;

  const note = state.notes.find((item) => item.id === state.selectedNoteId);
  elements.voiceMemoTitle.textContent = note?.title || (note ? "無題" : "メモ未選択");
  elements.voiceMemoTitle.title = elements.voiceMemoTitle.textContent;
  elements.voiceMemoPreview.textContent = transcript;
  elements.voiceMemoPreview.title = transcript;
  elements.voiceMemoStartButton.disabled = !note || !recognitionClass ||
    Boolean(activeRecognition) || phase === "saving";
  elements.voiceMemoStopButton.disabled = !activeRecognition && !(phase === "error" && transcript);
  elements.voiceMemoStopButton.textContent = phase === "error" && transcript
    ? "保存を再試行"
    : "停止して保存";
  elements.voiceMemoStatus.textContent = !note
    ? "先に保存先のメモを選択してください"
    : !recognitionClass
      ? "この環境では音声認識を利用できません"
      : phase === "error"
        ? errorMessage
        : {
          starting: "音声認識を開始中...",
          listening: "● 音声認識中",
          stopping: "停止中...",
          saving: "保存中...",
          saved: "保存しました",
          idle: "音声入力待機中"
        }[phase];
}
