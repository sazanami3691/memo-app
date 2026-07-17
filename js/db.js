"use strict";

import {
  DB_NAME,
  DB_VERSION,
  STORE_ASSETS,
  STORE_FOLDERS,
  STORE_NOTES,
  state
} from "./state.js";

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_FOLDERS)) {
        database.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(STORE_NOTES)) {
        database.createObjectStore(STORE_NOTES, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(STORE_ASSETS)) {
        database.createObjectStore(STORE_ASSETS, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      state.db = request.result;
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

export function getAllFolders() {
  return getAllFromStore(STORE_FOLDERS);
}

export function saveFolder(folder) {
  return putToStore(STORE_FOLDERS, folder);
}

export function deleteFolder(folderId) {
  return deleteFromStore(STORE_FOLDERS, folderId);
}

export function getAllNotes() {
  return getAllFromStore(STORE_NOTES);
}

export function saveNote(note) {
  return putToStore(STORE_NOTES, note);
}

export function deleteNote(noteId) {
  return deleteFromStore(STORE_NOTES, noteId);
}

export function getAllAssets() {
  return getAllFromStore(STORE_ASSETS);
}

export function saveAsset(asset) {
  return putToStore(STORE_ASSETS, asset);
}

export function deleteAsset(assetId) {
  return deleteFromStore(STORE_ASSETS, assetId);
}

export function getAllFromStore(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function putToStore(storeName, value) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(value);

    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

export function deleteFromStore(storeName, id) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadData() {
  state.folders = await getAllFolders();
  state.notes = await getAllNotes();
  state.assets = await getAllAssets();
  normalizeLoadedFolders();
  normalizeLoadedNotes();
}

function normalizeLoadedFolders() {
  state.folders.forEach((folder) => {
    if (folder.parentId) return;

    if (!Array.isArray(folder.imageSets)) {
      folder.imageSets = [];
      return;
    }

    folder.imageSets = folder.imageSets.filter((imageSet) => imageSet && typeof imageSet === "object");
    folder.imageSets.forEach((imageSet) => {
      if (!Array.isArray(imageSet.items)) {
        imageSet.items = [];
      }
    });
  });
}

function normalizeLoadedNotes() {
  state.notes.forEach((note) => {
    if (!Array.isArray(note.blocks)) {
      note.blocks = [];
    }
    note.isPinned = note.isPinned === true;
  });
}
