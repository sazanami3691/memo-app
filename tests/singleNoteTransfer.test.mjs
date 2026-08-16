import assert from "node:assert/strict";
import {
  SINGLE_NOTE_FILE_TYPE,
  SINGLE_NOTE_FORMAT_VERSION,
  createSingleNoteExportPayload,
  createSingleNoteFileName,
  createSingleNoteImportPlan,
  getSingleNoteImportTargetFolderId,
  validateSingleNoteFile
} from "../js/singleNoteTransfer.js";

const imageAsset = {
  id: "asset_image",
  type: "image",
  dataUrl: "data:image/jpeg;base64,AAAA",
  fileName: "face.jpg",
  isReusable: true,
  reusableName: "顔"
};
const drawingAsset = {
  id: "asset_drawing",
  type: "drawing",
  dataUrl: "data:image/png;base64,BBBB",
  width: 1200,
  height: 800
};
const note = {
  id: "note_source",
  folderId: "folder_source",
  title: "戦闘前イベント",
  blocks: [
    { id: "block_text", type: "text", text: "本文" },
    { id: "block_mz", type: "mzMessage", speakerName: "ミラベル", text: "開始" },
    { id: "block_image_1", type: "image", assetId: imageAsset.id, caption: "通常" },
    { id: "block_image_2", type: "image", assetId: imageAsset.id, caption: "再利用" },
    { id: "block_drawing", type: "drawing", assetId: drawingAsset.id, caption: "手書き" }
  ],
  isPinned: true,
  isShortcut: true,
  createdAt: 10,
  updatedAt: 20,
  customValue: "preserve"
};

const payload = createSingleNoteExportPayload(note, [
  imageAsset,
  drawingAsset,
  { id: "asset_other", type: "image", dataUrl: "data:image/jpeg;base64,CCCC" }
], 1234);
assert.equal(payload.fileType, SINGLE_NOTE_FILE_TYPE);
assert.equal(payload.formatVersion, SINGLE_NOTE_FORMAT_VERSION);
assert.equal(payload.exportedAt, 1234);
assert.deepEqual(payload.assets.map((asset) => asset.id), ["asset_image", "asset_drawing"]);
assert.notEqual(payload.note, note);
assert.equal(validateSingleNoteFile(payload), true);

const textOnlyPayload = createSingleNoteExportPayload({
  id: "note_text_only",
  folderId: "folder_source",
  title: "テキストとMZ",
  blocks: [
    { id: "block_text_only", type: "text", text: "本文" },
    { id: "block_mz_only", type: "mzMessage", speakerName: "話者", text: "MZ本文" }
  ]
}, [], 1235);
assert.deepEqual(textOnlyPayload.assets, []);
assert.equal(validateSingleNoteFile(textOnlyPayload), true);

assert.throws(
  () => createSingleNoteExportPayload(note, [imageAsset]),
  /見つかりません/
);
assert.throws(
  () => validateSingleNoteFile({ ...payload, fileType: undefined }),
  /メモ単体ファイル/
);
assert.throws(
  () => validateSingleNoteFile({
    appName: "Local Memo Binder",
    backupVersion: 1,
    exportedAt: 1234,
    folders: [],
    notes: [],
    assets: []
  }),
  /メモ単体ファイル/
);
assert.throws(
  () => validateSingleNoteFile({ ...payload, formatVersion: 99 }),
  /未対応/
);
assert.throws(
  () => validateSingleNoteFile({ ...payload, assets: [imageAsset] }),
  /不足/
);
assert.throws(
  () => validateSingleNoteFile({ ...payload, note: { ...payload.note, blocks: {} } }),
  /ブロック形式/
);
assert.throws(
  () => validateSingleNoteFile({
    ...payload,
    note: { ...payload.note, blocks: [{ id: "block_future", type: "futureBlock" }] },
    assets: []
  }),
  /未対応のブロック種別/
);

let sequence = 0;
const importPlan = createSingleNoteImportPlan(payload, {
  targetFolderId: "folder_target",
  existingNotes: [
    { id: "note_existing", folderId: "folder_target", title: "戦闘前イベント", blocks: [] },
    { id: "note_existing_2", folderId: "folder_target", title: "戦闘前イベント（読み込み）", blocks: [] }
  ],
  existingAssets: [{ id: "asset_existing" }],
  now: 9999,
  idFactory: (prefix) => `${prefix}_new_${++sequence}`
});
assert.notEqual(importPlan.note.id, payload.note.id);
assert.equal(importPlan.note.folderId, "folder_target");
assert.equal(importPlan.note.title, "戦闘前イベント（読み込み2）");
assert.equal(importPlan.note.isPinned, false);
assert.equal(importPlan.note.isShortcut, false);
assert.equal(importPlan.note.createdAt, 9999);
assert.equal(importPlan.note.updatedAt, 9999);
assert.equal(importPlan.note.customValue, "preserve");
assert.equal(new Set(importPlan.note.blocks.map((block) => block.id)).size, note.blocks.length);
assert.equal(importPlan.note.blocks[2].assetId, importPlan.note.blocks[3].assetId);
assert.notEqual(importPlan.note.blocks[2].assetId, imageAsset.id);
assert.notEqual(importPlan.note.blocks[4].assetId, drawingAsset.id);
assert.equal(importPlan.assets.some((asset) => asset.id === imageAsset.id), false);
assert.equal(Object.prototype.hasOwnProperty.call(importPlan.assets[0], "isReusable"), false);
assert.equal(Object.prototype.hasOwnProperty.call(importPlan.assets[0], "reusableName"), false);
assert.equal(note.blocks[2].assetId, imageAsset.id);

assert.equal(createSingleNoteFileName("戦闘前イベント"), "戦闘前イベント.memo.json");
assert.equal(createSingleNoteFileName("  "), "untitled-note.memo.json");
assert.equal(createSingleNoteFileName("bad:/name*?"), "bad_name_.memo.json");
assert.equal(createSingleNoteFileName("CON"), "untitled-note.memo.json");
assert.equal(createSingleNoteFileName("CON.txt"), "untitled-note.memo.json");

const folders = [
  { id: "parent", parentId: null },
  { id: "child", parentId: "parent" }
];
const notes = [{ id: "note", folderId: "child" }];
assert.equal(getSingleNoteImportTargetFolderId({
  appView: "editor",
  selectedNoteId: "note",
  selectedFolderId: "child",
  folderNavLevel: "notes",
  activeParentFolderId: "parent",
  activeChildFolderId: "child",
  folders,
  notes
}), "child");
assert.equal(getSingleNoteImportTargetFolderId({
  appView: "folders",
  selectedNoteId: null,
  selectedFolderId: "parent",
  folderNavLevel: "children",
  activeParentFolderId: "parent",
  activeChildFolderId: null,
  folders,
  notes
}), "parent");
assert.equal(getSingleNoteImportTargetFolderId({
  appView: "notes",
  selectedNoteId: null,
  selectedFolderId: "child",
  folderNavLevel: "notes",
  activeParentFolderId: "parent",
  activeChildFolderId: "child",
  folders,
  notes
}), "child");
assert.equal(getSingleNoteImportTargetFolderId({
  appView: "search",
  selectedNoteId: null,
  selectedFolderId: "child",
  folderNavLevel: "notes",
  activeParentFolderId: "parent",
  activeChildFolderId: "child",
  folders,
  notes
}), null);

console.log("singleNoteTransfer tests passed");
