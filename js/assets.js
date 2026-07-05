"use strict";

import { deleteAsset } from "./db.js";
import { state } from "./state.js";

export function getAssetById(assetId) {
  return state.assets.find((asset) => asset.id === assetId) || null;
}

export function isReusableImageAsset(asset) {
  return Boolean(asset && asset.type === "image" && asset.isReusable === true);
}

export function getReusableAssetName(asset) {
  return asset.reusableName || asset.fileName || "登録画像";
}

export function getReusableImageAssets() {
  return state.assets
    .filter(isReusableImageAsset)
    .sort((a, b) => getReusableAssetName(a).localeCompare(getReusableAssetName(b), "ja"));
}

export function isAssetUsedElsewhere(assetId, exceptNoteId, exceptBlockId) {
  return state.notes.some((note) => {
    return note.blocks.some((block) => {
      if (note.id === exceptNoteId && block.id === exceptBlockId) return false;
      return (block.type === "image" || block.type === "drawing") && block.assetId === assetId;
    });
  });
}

export async function deleteAssetIfUnused(assetId, exceptNoteId, exceptBlockId) {
  const asset = getAssetById(assetId);
  if (isReusableImageAsset(asset)) return;

  if (isAssetUsedElsewhere(assetId, exceptNoteId, exceptBlockId)) return;

  await deleteAsset(assetId);
  state.assets = state.assets.filter((asset) => asset.id !== assetId);
}

export async function deleteUnusedAssets(assetIds) {
  for (const assetId of assetIds) {
    const asset = getAssetById(assetId);
    if (isReusableImageAsset(asset)) continue;

    if (!isAssetUsedElsewhere(assetId, null, null)) {
      await deleteAsset(assetId);
      state.assets = state.assets.filter((asset) => asset.id !== assetId);
    }
  }
}

export function collectAssetIdsFromNotes(targetNotes) {
  const assetIds = targetNotes.flatMap((note) => {
    return note.blocks
      .filter((block) => (block.type === "image" || block.type === "drawing") && block.assetId)
      .map((block) => block.assetId);
  });

  return [...new Set(assetIds)];
}

export function createMissingAssetMessage(messageText = "画像データが見つかりません") {
  const message = document.createElement("div");
  message.className = "missing-asset";
  message.textContent = messageText;
  return message;
}
