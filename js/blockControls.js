"use strict";

export function createBlockControls(block, index, blockCount, handlers) {
  const controls = document.createElement("div");
  controls.className = "block-controls";

  const upButton = document.createElement("button");
  upButton.type = "button";
  upButton.textContent = "上へ";
  upButton.disabled = index === 0;
  upButton.addEventListener("click", () => handlers.moveBlockUp(block.id));

  const downButton = document.createElement("button");
  downButton.type = "button";
  downButton.textContent = "下へ";
  downButton.disabled = index === blockCount - 1;
  downButton.addEventListener("click", () => handlers.moveBlockDown(block.id));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-button";
  deleteButton.textContent = "削除";
  deleteButton.addEventListener("click", () => handlers.deleteBlock(block.id));

  controls.append(upButton, downButton, deleteButton);
  return controls;
}

export function createBlockInsertActions(blockId, handlers) {
  const actions = document.createElement("div");
  actions.className = "block-insert-actions";

  const addTextButton = document.createElement("button");
  addTextButton.type = "button";
  addTextButton.textContent = "下にテキスト追加";
  addTextButton.addEventListener("click", () => handlers.insertTextBlockAfter(blockId));

  const addMzMessageButton = document.createElement("button");
  addMzMessageButton.type = "button";
  addMzMessageButton.textContent = "下にMZ文章追加";
  addMzMessageButton.addEventListener("click", () => handlers.insertMzMessageBlockAfter(blockId));

  const addImageButton = document.createElement("button");
  addImageButton.type = "button";
  addImageButton.textContent = "下に画像追加";
  addImageButton.addEventListener("click", () => handlers.insertImageBlockAfter(blockId));

  const addReusableImageButton = document.createElement("button");
  addReusableImageButton.type = "button";
  addReusableImageButton.textContent = "下に登録画像追加";
  addReusableImageButton.addEventListener("click", () => handlers.insertReusableImageBlockAfter(blockId));

  const addDrawingButton = document.createElement("button");
  addDrawingButton.type = "button";
  addDrawingButton.textContent = "下に手書き追加";
  addDrawingButton.addEventListener("click", () => handlers.insertDrawingBlockAfter(blockId));

  actions.append(addTextButton, addMzMessageButton, addImageButton, addReusableImageButton, addDrawingButton);
  return actions;
}
