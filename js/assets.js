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

export function isAssetReferencedByImageSets(assetId) {
  return state.folders.some((folder) => {
    if (!Array.isArray(folder.imageSets)) return false;
    return folder.imageSets.some((imageSet) => {
      return Array.isArray(imageSet?.items) &&
        imageSet.items.some((item) => item?.assetId === assetId);
    });
  });
}

export function isAssetReferencedAnywhere(assetId, options = {}) {
  const asset = getAssetById(assetId);
  if (isReusableImageAsset(asset)) return true;
  if (isAssetReferencedByImageSets(assetId)) return true;

  return isAssetUsedElsewhere(
    assetId,
    options.exceptNoteId || null,
    options.exceptBlockId || null
  );
}

export async function deleteAssetIfUnused(assetId, exceptNoteId, exceptBlockId) {
  if (isAssetReferencedAnywhere(assetId, { exceptNoteId, exceptBlockId })) return;

  await deleteAsset(assetId);
  state.assets = state.assets.filter((asset) => asset.id !== assetId);
}

export async function deleteUnusedAssets(assetIds) {
  for (const assetId of assetIds) {
    if (!isAssetReferencedAnywhere(assetId)) {
      await deleteAsset(assetId);
      state.assets = state.assets.filter((asset) => asset.id !== assetId);
    }
  }
}

export function collectAssetIdsFromImageSets(targetFolders) {
  const assetIds = targetFolders.flatMap((folder) => {
    if (!Array.isArray(folder.imageSets)) return [];
    return folder.imageSets.flatMap((imageSet) => {
      if (!Array.isArray(imageSet?.items)) return [];
      return imageSet.items.map((item) => item?.assetId).filter(Boolean);
    });
  });

  return [...new Set(assetIds)];
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
