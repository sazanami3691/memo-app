"use strict";

import { addNoteBundle } from "./db.js";
import { openNoteById } from "./noteNavigation.js";
import { BACKUP_APP_NAME, elements, state } from "./state.js";
import { createId, downloadJsonFile, readJsonFile } from "./utils.js";

export const SINGLE_NOTE_FILE_TYPE = "single-note";
export const SINGLE_NOTE_FORMAT_VERSION = 1;
const SUPPORTED_BLOCK_TYPES = new Set(["text", "mzMessage", "image", "drawing"]);

export function createSingleNoteExportPayload(note, availableAssets, exportedAt = Date.now()) {
  if (!isRecord(note) || !Array.isArray(note.blocks)) {
    throw new Error("書き出すメモの形式が正しくありません。");
  }

  const assetById = new Map(availableAssets.map((asset) => [asset?.id, asset]));
  const referencedAssetIds = collectReferencedAssetIds(note.blocks);
  const assets = referencedAssetIds.map((assetId) => {
    const asset = assetById.get(assetId);
    if (!asset) {
      throw new Error(`参照中の画像・手書きデータが見つかりません: ${assetId}`);
    }
    return cloneJsonValue(asset);
  });

  const payload = {
    appName: BACKUP_APP_NAME,
    fileType: SINGLE_NOTE_FILE_TYPE,
    formatVersion: SINGLE_NOTE_FORMAT_VERSION,
    exportedAt,
    note: cloneJsonValue(note),
    assets
  };
  validateSingleNoteFile(payload);
  return payload;
}

export function validateSingleNoteFile(payload) {
  if (!isRecord(payload)) {
    throw new Error("メモファイルの形式が正しくありません。");
  }
  if (payload.appName !== BACKUP_APP_NAME || payload.fileType !== SINGLE_NOTE_FILE_TYPE) {
    throw new Error("メモ単体ファイルではありません。");
  }
  if (payload.formatVersion !== SINGLE_NOTE_FORMAT_VERSION) {
    throw new Error("未対応のメモファイルバージョンです。");
  }
  if (!Number.isFinite(payload.exportedAt)) {
    throw new Error("書き出し日時が正しくありません。");
  }
  if (!isRecord(payload.note) || !isNonEmptyString(payload.note.id)) {
    throw new Error("メモデータが見つからないか、IDが不正です。");
  }
  if (typeof payload.note.title !== "string" || !Array.isArray(payload.note.blocks)) {
    throw new Error("メモのタイトルまたはブロック形式が正しくありません。");
  }
  if (!Array.isArray(payload.assets)) {
    throw new Error("assetsが配列ではありません。");
  }

  const blockIds = new Set();
  const referencedAssetTypes = new Map();
  payload.note.blocks.forEach((block) => {
    if (!isRecord(block) || !isNonEmptyString(block.id) || !isNonEmptyString(block.type)) {
      throw new Error("不正なブロックが含まれています。");
    }
    if (!SUPPORTED_BLOCK_TYPES.has(block.type)) {
      throw new Error(`未対応のブロック種別が含まれています: ${block.type}`);
    }
    if (blockIds.has(block.id)) {
      throw new Error("重複したブロックIDが含まれています。");
    }
    blockIds.add(block.id);

    if (block.type === "image" || block.type === "drawing") {
      if (!isNonEmptyString(block.assetId)) {
        throw new Error("画像・手書きブロックのassetIdが不正です。");
      }
      const previousType = referencedAssetTypes.get(block.assetId);
      if (previousType && previousType !== block.type) {
        throw new Error("同じassetIdが異なるブロック種別から参照されています。");
      }
      referencedAssetTypes.set(block.assetId, block.type);
    }
  });

  const assetIds = new Set();
  payload.assets.forEach((asset) => {
    if (!isRecord(asset) || !isNonEmptyString(asset.id)) {
      throw new Error("不正なassetが含まれています。");
    }
    if (assetIds.has(asset.id)) {
      throw new Error("重複したasset IDが含まれています。");
    }
    assetIds.add(asset.id);

    const expectedType = referencedAssetTypes.get(asset.id);
    if (!expectedType) {
      throw new Error("メモから参照されていないassetが含まれています。");
    }
    if (asset.type !== expectedType) {
      throw new Error("ブロックとassetの種別が一致しません。");
    }
    if (!isImageDataUrl(asset.dataUrl)) {
      throw new Error("assetの画像データが不正です。");
    }
  });

  referencedAssetTypes.forEach((_type, assetId) => {
    if (!assetIds.has(assetId)) {
      throw new Error(`必要なassetが不足しています: ${assetId}`);
    }
  });
  return true;
}

export function createSingleNoteImportPlan(payload, options) {
  validateSingleNoteFile(payload);
  const {
    targetFolderId,
    existingNotes = [],
    existingAssets = [],
    now = Date.now(),
    idFactory = createId
  } = options || {};
  if (!isNonEmptyString(targetFolderId)) {
    throw new Error("読み込み先フォルダが指定されていません。");
  }

  const usedIds = collectExistingIds(existingNotes, existingAssets);
  const assetIdMap = new Map();
  const assets = payload.assets.map((sourceAsset) => {
    const asset = cloneJsonValue(sourceAsset);
    const newAssetId = createUniqueId("asset", usedIds, idFactory);
    assetIdMap.set(sourceAsset.id, newAssetId);
    asset.id = newAssetId;
    delete asset.isReusable;
    delete asset.reusableName;
    asset.createdAt = now;
    if (asset.type === "drawing" || Object.prototype.hasOwnProperty.call(asset, "updatedAt")) {
      asset.updatedAt = now;
    }
    return asset;
  });

  const sourceNote = cloneJsonValue(payload.note);
  const blocks = sourceNote.blocks.map((block) => {
    const importedBlock = {
      ...block,
      id: createUniqueId("block", usedIds, idFactory)
    };
    if (block.type === "image" || block.type === "drawing") {
      importedBlock.assetId = assetIdMap.get(block.assetId);
    }
    return importedBlock;
  });

  const note = {
    ...sourceNote,
    id: createUniqueId("note", usedIds, idFactory),
    folderId: targetFolderId,
    title: createImportedNoteTitle(sourceNote.title, targetFolderId, existingNotes),
    blocks,
    isPinned: false,
    isShortcut: false,
    createdAt: now,
    updatedAt: now
  };

  return {
    note,
    assets,
    assetIdMap: Object.fromEntries(assetIdMap)
  };
}

export function createSingleNoteFileName(title) {
  let safeTitle = typeof title === "string" ? title.trim() : "";
  safeTitle = safeTitle
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .replace(/[. ]+$/g, "")
    .trim();
  if (!safeTitle || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeTitle)) {
    safeTitle = "untitled-note";
  }
  return `${safeTitle}.memo.json`;
}

export function getSingleNoteImportTargetFolderId(appState = state) {
  const selectedNote = appState.notes.find((note) => note.id === appState.selectedNoteId);
  if (appState.appView === "editor" && selectedNote) {
    return appState.folders.some((folder) => folder.id === selectedNote.folderId)
      ? selectedNote.folderId
      : null;
  }

  const selectedFolder = appState.folders.find((folder) => folder.id === appState.selectedFolderId);
  if (!selectedFolder) return null;
  if (appState.appView === "folders" && appState.folderNavLevel === "children") {
    return !selectedFolder.parentId && selectedFolder.id === appState.activeParentFolderId
      ? selectedFolder.id
      : null;
  }
  if (appState.appView === "notes" && appState.folderNavLevel === "notes") {
    return selectedFolder.parentId && selectedFolder.id === appState.activeChildFolderId
      ? selectedFolder.id
      : null;
  }
  return null;
}

export function exportSelectedNote() {
  const note = state.notes.find((item) => item.id === state.selectedNoteId);
  if (!note) return;

  try {
    const payload = createSingleNoteExportPayload(note, state.assets);
    downloadJsonFile(JSON.stringify(payload, null, 2), createSingleNoteFileName(note.title));
  } catch (error) {
    console.error(error);
    alert(`メモの書き出しに失敗しました。\n${error.message}`);
  }
}

export function beginSingleNoteImport() {
  if (!getSingleNoteImportTargetFolderId()) {
    alert("読み込み先のフォルダを開いてから実行してください。");
    return;
  }
  elements.singleNoteFileInput.value = "";
  elements.singleNoteFileInput.click();
}

export async function handleSingleNoteFileSelected() {
  const file = elements.singleNoteFileInput.files[0];
  if (!file) return;

  try {
    const targetFolderId = getSingleNoteImportTargetFolderId();
    if (!targetFolderId) {
      throw new Error("読み込み先のフォルダを開いてから実行してください。");
    }
    const payload = await readJsonFile(file);
    const plan = createSingleNoteImportPlan(payload, {
      targetFolderId,
      existingNotes: state.notes,
      existingAssets: state.assets
    });
    if (!state.folders.some((folder) => folder.id === targetFolderId)) {
      throw new Error("読み込み先フォルダが見つかりません。");
    }

    await addNoteBundle(plan.note, plan.assets);
    state.assets.push(...plan.assets);
    state.notes.push(plan.note);
    openNoteById(plan.note.id, { clearSearchReturnState: true });
    alert("メモを読み込みました。");
  } catch (error) {
    console.error(error);
    const detail = error instanceof SyntaxError
      ? "JSON形式が正しくありません。"
      : error.message || "ファイル形式を確認してください。";
    alert(`メモファイルの読み込みに失敗しました。\n${detail}`);
  } finally {
    elements.singleNoteFileInput.value = "";
  }
}

export function updateSingleNoteTransferButtons() {
  const hasSelectedNote = state.notes.some((note) => note.id === state.selectedNoteId);
  elements.exportSingleNoteButton.disabled = !hasSelectedNote;
  elements.importSingleNoteButton.disabled = !getSingleNoteImportTargetFolderId();
}

function collectReferencedAssetIds(blocks) {
  return [...new Set(blocks
    .filter((block) => (block?.type === "image" || block?.type === "drawing") && block.assetId)
    .map((block) => block.assetId))];
}

function collectExistingIds(notes, assets) {
  const ids = new Set();
  notes.forEach((note) => {
    if (note?.id) ids.add(note.id);
    if (Array.isArray(note?.blocks)) {
      note.blocks.forEach((block) => {
        if (block?.id) ids.add(block.id);
      });
    }
  });
  assets.forEach((asset) => {
    if (asset?.id) ids.add(asset.id);
  });
  return ids;
}

function createUniqueId(prefix, usedIds, idFactory) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = idFactory(prefix);
    if (isNonEmptyString(id) && !usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
  throw new Error("一意のIDを生成できませんでした。");
}

function createImportedNoteTitle(title, targetFolderId, existingNotes) {
  const baseTitle = title.trim() || "無題";
  const existingTitles = new Set(existingNotes
    .filter((note) => note.folderId === targetFolderId)
    .map((note) => note.title || "無題"));
  if (!existingTitles.has(baseTitle)) return baseTitle;

  const firstCandidate = `${baseTitle}（読み込み）`;
  if (!existingTitles.has(firstCandidate)) return firstCandidate;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${baseTitle}（読み込み${suffix}）`;
    if (!existingTitles.has(candidate)) return candidate;
  }
  throw new Error("重複しないメモタイトルを生成できませんでした。");
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isImageDataUrl(value) {
  return typeof value === "string" && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}
