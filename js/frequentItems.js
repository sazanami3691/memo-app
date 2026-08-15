"use strict";

import { getFolderPath } from "./noteNavigation.js";
import { elements, state } from "./state.js";

export function renderFrequentItems(onOpenNote) {
  if (!elements.frequentItemList) return;

  elements.frequentItemList.innerHTML = "";
  const items = createFavoriteNoteItems(onOpenNote);
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "frequent-item-empty";
    empty.textContent = "お気に入りはまだありません。";
    elements.frequentItemList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    elements.frequentItemList.appendChild(createFrequentItemButton(item));
  });
}

function createFavoriteNoteItems(onOpenNote) {
  return state.notes
    .filter((note) => note.isPinned === true)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((note) => ({
      type: "note",
      id: note.id,
      icon: "📌 📝",
      title: note.title || "無題",
      meta: getFolderPath(note.folderId),
      onOpen: () => onOpenNote(note.id)
    }));
}

function createFrequentItemButton(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "frequent-item";
  button.dataset.itemType = item.type;
  button.dataset.itemId = item.id;
  button.setAttribute("aria-label", `${item.title}（${item.meta}）`);
  button.addEventListener("click", item.onOpen);

  const icon = document.createElement("span");
  icon.className = "frequent-item-icon";
  icon.textContent = item.icon;
  icon.setAttribute("aria-hidden", "true");

  const body = document.createElement("span");
  body.className = "frequent-item-body";

  const title = document.createElement("span");
  title.className = "frequent-item-title";
  title.textContent = item.title;

  const meta = document.createElement("span");
  meta.className = "frequent-item-meta";
  meta.textContent = item.meta;

  body.append(title, meta);
  button.append(icon, body);
  return button;
}
