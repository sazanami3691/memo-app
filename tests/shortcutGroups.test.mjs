import assert from "node:assert/strict";
import { validateBackupData } from "../js/backup.js";
import {
  addShortcutGroup,
  applyShortcutFlagsToNotes,
  createLegacyShortcutGroups,
  deleteShortcutGroup,
  getNoteShortcutGroupIds,
  initializeShortcutGroups,
  removeNoteIdsFromShortcutGroups,
  replaceShortcutGroups,
  renameShortcutGroup,
  resolveShortcutGroupsForRestore,
  setNoteShortcutGroupIds,
  updateNoteShortcutGroups,
  validateShortcutGroups
} from "../js/shortcutGroups.js";
import { SHORTCUT_GROUPS_STORAGE_KEY, state } from "../js/state.js";

function createMemoryStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(SHORTCUT_GROUPS_STORAGE_KEY, initialValue);
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

const legacyNotes = [
  { id: "note_a", isShortcut: true },
  { id: "note_b", isShortcut: false },
  { id: "note_c", isShortcut: true }
];
const legacyGroups = createLegacyShortcutGroups(legacyNotes, {
  now: 100,
  idFactory: () => "shortcutGroup_legacy"
});
assert.equal(legacyGroups.length, 1);
assert.equal(legacyGroups[0].name, "ショートカット");
assert.deepEqual(legacyGroups[0].items, [
  { type: "note", id: "note_a" },
  { type: "note", id: "note_c" }
]);

const migrationStorage = createMemoryStorage();
state.notes = legacyNotes.map((note) => ({ ...note }));
state.shortcutGroups = [];
const savedFlags = [];
await initializeShortcutGroups({
  storage: migrationStorage,
  now: 100,
  idFactory: () => "shortcutGroup_legacy",
  saveNoteFn: async (note) => savedFlags.push([note.id, note.isShortcut])
});
assert.deepEqual(state.shortcutGroups, legacyGroups);
assert.deepEqual(savedFlags, []);

await initializeShortcutGroups({
  storage: migrationStorage,
  now: 200,
  idFactory: () => {
    throw new Error("保存済みグループの再読み込みでIDを作り直してはいけません。");
  },
  saveNoteFn: async () => {}
});
assert.equal(state.shortcutGroups.length, 1);
assert.equal(state.shortcutGroups[0].items.length, 2);

const brokenStorage = createMemoryStorage("{broken-json");
const originalWarn = console.warn;
console.warn = () => {};
await initializeShortcutGroups({
  storage: brokenStorage,
  now: 250,
  idFactory: () => "shortcutGroup_recovered",
  saveNoteFn: async () => {}
});
console.warn = originalWarn;
assert.equal(state.shortcutGroups[0].id, "shortcutGroup_recovered");
assert.doesNotThrow(() => JSON.parse(brokenStorage.getItem(SHORTCUT_GROUPS_STORAGE_KEY)));

const workGroup = {
  id: "shortcutGroup_work",
  name: "作業中",
  items: [],
  createdAt: 200,
  updatedAt: 200
};
const characterGroup = {
  id: "shortcutGroup_character",
  name: "キャラクター",
  items: [],
  createdAt: 201,
  updatedAt: 201
};
let groups = setNoteShortcutGroupIds(
  [workGroup, characterGroup],
  "note_a",
  [workGroup.id, characterGroup.id],
  300
);
assert.deepEqual(getNoteShortcutGroupIds(groups, "note_a"), [workGroup.id, characterGroup.id]);
groups = setNoteShortcutGroupIds(groups, "note_a", [characterGroup.id], 301);
assert.deepEqual(getNoteShortcutGroupIds(groups, "note_a"), [characterGroup.id]);
groups = setNoteShortcutGroupIds(groups, "note_a", [], 302);
assert.deepEqual(getNoteShortcutGroupIds(groups, "note_a"), []);

const cleanupGroups = removeNoteIdsFromShortcutGroups([
  { ...workGroup, items: [{ type: "note", id: "note_a" }, { type: "note", id: "note_b" }] },
  { ...characterGroup, items: [{ type: "note", id: "note_a" }] }
], ["note_a"], 400);
assert.deepEqual(cleanupGroups[0].items, [{ type: "note", id: "note_b" }]);
assert.deepEqual(cleanupGroups[1].items, []);

const runtimeStorage = createMemoryStorage(JSON.stringify([]));
state.notes = [
  { id: "note_runtime", isShortcut: false },
  { id: "note_other", isShortcut: false }
];
state.shortcutGroups = [];
state.quickAccessExpandedSections = new Set(["favorites"]);
const savedRuntimeNotes = [];
const runtimeOptions = {
  storage: runtimeStorage,
  saveNoteFn: async (note) => savedRuntimeNotes.push({ ...note })
};
const runtimeWorkGroup = await addShortcutGroup("作業中", {
  ...runtimeOptions,
  now: 500,
  idFactory: () => "shortcutGroup_runtime_work"
});
const runtimeCharacterGroup = await addShortcutGroup("キャラクター", {
  ...runtimeOptions,
  now: 501,
  idFactory: () => "shortcutGroup_runtime_character"
});
await assert.rejects(
  addShortcutGroup("作業中", {
    ...runtimeOptions,
    idFactory: () => "shortcutGroup_duplicate"
  }),
  /同じ名前/
);
await renameShortcutGroup(runtimeCharacterGroup.id, "キャラクター資料", {
  ...runtimeOptions,
  now: 505
});
assert.equal(
  state.shortcutGroups.find((group) => group.id === runtimeCharacterGroup.id).name,
  "キャラクター資料"
);
assert.equal(
  state.quickAccessExpandedSections.has(`shortcut-group:${runtimeCharacterGroup.id}`),
  true
);

await updateNoteShortcutGroups("note_runtime", [runtimeWorkGroup.id, runtimeCharacterGroup.id], {
  ...runtimeOptions,
  now: 510
});
assert.equal(state.notes[0].isShortcut, true);
assert.equal(getNoteShortcutGroupIds(state.shortcutGroups, "note_runtime").length, 2);

await deleteShortcutGroup(runtimeWorkGroup.id, runtimeOptions);
assert.equal(state.notes[0].isShortcut, true);
assert.deepEqual(getNoteShortcutGroupIds(state.shortcutGroups, "note_runtime"), [runtimeCharacterGroup.id]);
await deleteShortcutGroup(runtimeCharacterGroup.id, runtimeOptions);
assert.equal(state.notes[0].isShortcut, false);
assert.deepEqual(state.shortcutGroups, []);
assert.ok(savedRuntimeNotes.some((note) => note.id === "note_runtime" && note.isShortcut === true));
assert.ok(savedRuntimeNotes.some((note) => note.id === "note_runtime" && note.isShortcut === false));

const backupGroups = [{
  id: "shortcutGroup_backup",
  name: "会話イベント",
  items: [{ type: "note", id: "note_backup" }],
  createdAt: 600,
  updatedAt: 600
}];
assert.equal(validateShortcutGroups(backupGroups, new Set(["note_backup"])), true);
assert.throws(
  () => validateShortcutGroups(backupGroups, new Set(["different_note"])),
  /存在しないメモ/
);
assert.throws(
  () => validateShortcutGroups([{ ...backupGroups[0], items: [{ type: "file", id: "file_a" }] }]),
  /不正なショートカット項目/
);

const restoredNewGroups = resolveShortcutGroupsForRestore(backupGroups, [
  { id: "note_backup", isShortcut: false }
]);
assert.deepEqual(restoredNewGroups, backupGroups);
assert.equal(applyShortcutFlagsToNotes([
  { id: "note_backup", isShortcut: false },
  { id: "note_plain", isShortcut: true }
], restoredNewGroups)[0].isShortcut, true);
assert.equal(applyShortcutFlagsToNotes([
  { id: "note_backup", isShortcut: false },
  { id: "note_plain", isShortcut: true }
], restoredNewGroups)[1].isShortcut, false);

const restoredLegacyGroups = resolveShortcutGroupsForRestore(undefined, [
  { id: "note_old_shortcut", isShortcut: true },
  { id: "note_old_plain", isShortcut: false }
], {
  now: 700,
  idFactory: () => "shortcutGroup_restored_legacy"
});
assert.deepEqual(restoredLegacyGroups[0].items, [
  { type: "note", id: "note_old_shortcut" }
]);
const restoreStorage = createMemoryStorage(JSON.stringify(backupGroups));
state.shortcutGroups = backupGroups;
state.quickAccessExpandedSections = new Set(["favorites", "shortcut-group:old"]);
await replaceShortcutGroups(restoredLegacyGroups, {
  notes: [{ id: "note_old_shortcut", isShortcut: true }],
  storage: restoreStorage,
  syncFlags: false,
  resetExpandedSections: true
});
assert.deepEqual(
  JSON.parse(restoreStorage.getItem(SHORTCUT_GROUPS_STORAGE_KEY)),
  restoredLegacyGroups
);
assert.equal(state.quickAccessExpandedSections.has("shortcut-group:old"), false);
assert.equal(
  state.quickAccessExpandedSections.has("shortcut-group:shortcutGroup_restored_legacy"),
  true
);

const oldBackup = {
  data: {
    folders: [{ id: "folder_backup" }],
    notes: [{ id: "note_backup", isShortcut: true }],
    assets: []
  }
};
assert.equal(validateBackupData(oldBackup), undefined);
assert.equal(validateBackupData({
  data: {
    ...oldBackup.data,
    shortcutGroups: backupGroups
  }
}), undefined);
assert.throws(
  () => validateBackupData({
    data: {
      ...oldBackup.data,
      shortcutGroups: [{ ...backupGroups[0], items: [{ type: "note", id: "missing_note" }] }]
    }
  }),
  /存在しないメモ/
);

console.log("shortcutGroups tests passed");
