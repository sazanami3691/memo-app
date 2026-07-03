"use strict";

export const DB_NAME = "local_memo_app_phase1";
export const DB_VERSION = 2;
export const STORE_FOLDERS = "folders";
export const STORE_NOTES = "notes";
export const STORE_ASSETS = "assets";

export const AUTO_SAVE_DELAY = 400;
export const BACKUP_APP_NAME = "Local Memo Binder";
export const BACKUP_VERSION = 1;
export const CONTROL_PANEL_STORAGE_KEY = "memoAppControlPanelOpen";
export const THEME_STORAGE_KEY = "memoAppTheme";
export const MZ_DISPLAY_MODE_STORAGE_KEY = "memoAppMzDisplayMode";

export const IMAGE_MAX_SIZE = 1200;
export const IMAGE_JPEG_QUALITY = 0.82;

export const DRAWING_WIDTH = 1200;
export const DRAWING_HEIGHT = 800;
export const DRAWING_SIZES = {
  small: 3,
  medium: 8,
  large: 16
};

export const elements = {};

export const state = {
  db: null,
  folders: [],
  notes: [],
  assets: [],
  selectedFolderId: null,
  selectedNoteId: null,
  appView: "folders",
  editorMode: "preview",
  theme: "light",
  mzDisplayMode: "window",
  controlPanelOpen: false,
  folderNavLevel: "parents",
  activeParentFolderId: null,
  activeChildFolderId: null,
  searchQuery: "",
  searchReturnState: null,
  editorReturnView: null,
  autoSaveTimer: null,
  isLoadingEditor: false,
  pendingImageInsertAfterBlockId: null,
  pendingDrawingInsertAfterBlockId: null,
  editingDrawingAssetId: null,
  drawingContext: null,
  drawingMode: "pen",
  drawingSize: DRAWING_SIZES.medium,
  drawingStrokes: [],
  drawingRedoStack: [],
  currentDrawingStroke: null,
  isDrawing: false,
  baseDrawingDataUrl: null
};

export const appActions = {
  renderAll: () => {}
};

export function setRenderAllAction(renderAll) {
  appActions.renderAll = renderAll;
}
