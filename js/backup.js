"use strict";

import {
  getAllAssets,
  getAllFolders,
  getAllNotes,
  loadData,
  saveAsset,
  saveFolder,
  saveNote,
  clearStore
} from "./db.js";
import { closeDrawingModal } from "./drawingBlocks.js";
import { closeImageModal } from "./imageBlocks.js";
import { ensureInitialFolder, selectInitialFolder } from "./folders.js";
import { setSaveStatus } from "./notes.js";
import {
  BACKUP_APP_NAME,
  BACKUP_VERSION,
  STORE_ASSETS,
  STORE_FOLDERS,
  STORE_NOTES,
  appActions,
  elements,
  state
} from "./state.js";
import { createBackupFileName, downloadJsonFile, readJsonFile } from "./utils.js";

export async function exportBackup() {
  try {
    const folders = (await getAllFolders()).map((folder) => {
      if (folder.parentId) return folder;
      return {
        ...folder,
        imageSets: Array.isArray(folder.imageSets) ? folder.imageSets : []
      };
    });
    const backup = {
      appName: BACKUP_APP_NAME,
      backupVersion: BACKUP_VERSION,
      exportedAt: Date.now(),
      data: {
        folders,
        notes: await getAllNotes(),
        assets: await getAllAssets()
      }
    };

    const jsonText = JSON.stringify(backup, null, 2);
    downloadJsonFile(jsonText, createBackupFileName());
  } catch (error) {
    console.error(error);
    alert("バックアップの書き出しに失敗しました。");
  }
}

export async function handleBackupFileSelected() {
  const file = elements.backupFileInput.files[0];
  if (!file) return;

  try {
    const backup = await importBackupFile(file);
    validateBackupData(backup);

    const ok = confirm(
      "現在のメモ、画像、手書きデータをすべて削除して、バックアップ内容で上書き復元します。\n" +
      "この操作は取り消せません。\n" +
      "復元してよろしいですか？"
    );
    if (!ok) return;

    window.clearTimeout(state.autoSaveTimer);
    state.pendingImageInsertAfterBlockId = null;
    state.pendingDrawingInsertAfterBlockId = null;
    closeImageModal();
    closeDrawingModal();
    await restoreBackupData(backup.data);
    await loadData();
    await ensureInitialFolder();
    selectInitialFolder();
    state.selectedNoteId = null;
    appActions.renderAll();
    setSaveStatus("保存済み");

    alert("バックアップを復元しました。");
  } catch (error) {
    console.error(error);
    alert("バックアップの読み込みに失敗しました。ファイル形式を確認してください。");
  } finally {
    elements.backupFileInput.value = "";
  }
}

export function importBackupFile(file) {
  return readJsonFile(file);
}

export function validateBackupData(backup) {
  if (!backup || typeof backup !== "object") {
    throw new Error("バックアップファイルの形式が正しくありません。");
  }

  if (!backup.data || typeof backup.data !== "object") {
    throw new Error("バックアップファイルのdataが見つかりません。");
  }

  if (!Array.isArray(backup.data.folders) ||
      !Array.isArray(backup.data.notes) ||
      !Array.isArray(backup.data.assets)) {
    throw new Error("バックアップファイルの配列形式が正しくありません。");
  }

  if (!backup.data.folders.every((folder) => folder && folder.id)) {
    throw new Error("idのないフォルダが含まれています。");
  }

  if (!backup.data.notes.every((note) => note && note.id)) {
    throw new Error("idのないメモが含まれています。");
  }

  if (!backup.data.assets.every((asset) => asset && asset.id)) {
    throw new Error("idのないassetが含まれています。");
  }
}

export async function clearAllData() {
  await clearStore(STORE_FOLDERS);
  await clearStore(STORE_NOTES);
  await clearStore(STORE_ASSETS);
}

export async function restoreBackupData(backupData) {
  await clearAllData();

  for (const folder of backupData.folders) {
    await saveFolder(folder);
  }

  for (const note of backupData.notes) {
    await saveNote(note);
  }

  for (const asset of backupData.assets) {
    await saveAsset(asset);
  }
}
