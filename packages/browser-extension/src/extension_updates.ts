export const PENDING_UPDATE_VERSION = "codexPendingUpdateVersion";
interface UpdateOptions {
  currentVersion?: string | null;
  onUpdateAvailable?: typeof chrome.runtime.onUpdateAvailable;
  reload?: () => void;
  storage?: Pick<chrome.storage.StorageArea, "get" | "set" | "remove">;
}
/** Original _k. Preserve restoration/clearing order and original concurrent-call semantics. */
export function createExtensionUpdateManagerClass(
  chromeApi: Pick<typeof chrome, "runtime" | "storage">,
) {
  return class ExtensionUpdateManager {
    pendingUpdateVersion: string | null = null;
    reloadInProgress = false;
    currentVersion: string | null;
    isInUse: () => boolean;
    onUpdateAvailable: typeof chrome.runtime.onUpdateAvailable;
    reload: () => void;
    storage: Pick<chrome.storage.StorageArea, "get" | "set" | "remove">;
    constructor(isInUse: () => boolean, options: UpdateOptions = {}) {
      this.currentVersion = options.currentVersion ?? null;
      this.isInUse = isInUse;
      this.onUpdateAvailable =
        options.onUpdateAvailable ?? chromeApi.runtime.onUpdateAvailable;
      this.reload = options.reload ?? (() => chromeApi.runtime.reload());
      this.storage = options.storage ?? chromeApi.storage.session;
    }
    register() {
      this.onUpdateAvailable.addListener(async (update) => {
        await this.handleUpdateAvailable(update).catch(() => {});
      });
      this.maybeReloadForPendingUpdate().catch(() => {});
    }
    get installedVersion() {
      return this.currentVersion ?? chromeApi.runtime.getManifest().version;
    }
    async maybeReloadForPendingUpdate() {
      if (!this.reloadInProgress) {
        if (this.pendingUpdateVersion == null)
          await this.restorePendingUpdate();
        if (this.pendingUpdateVersion != null && !this.isInUse()) {
          this.reloadInProgress = true;
          try {
            await this.clearPendingUpdate();
            this.reload();
          } catch (error) {
            this.reloadInProgress = false;
            throw error;
          }
        }
      }
    }
    async handleUpdateAvailable(update: { version: string }) {
      await this.storage.set({ [PENDING_UPDATE_VERSION]: update.version });
      this.pendingUpdateVersion = update.version;
      await this.maybeReloadForPendingUpdate();
    }
    async restorePendingUpdate() {
      const value = (await this.storage.get(PENDING_UPDATE_VERSION))[
        PENDING_UPDATE_VERSION
      ];
      if (typeof value === "string") {
        if (value === this.installedVersion) {
          await this.clearPendingUpdate();
          return;
        }
        this.pendingUpdateVersion = value;
      }
    }
    async clearPendingUpdate() {
      this.pendingUpdateVersion = null;
      await this.storage.remove(PENDING_UPDATE_VERSION);
    }
  };
}
