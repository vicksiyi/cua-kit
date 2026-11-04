import {
  createUpdateDetails,
  Storage,
  UPDATE_DETAIL_ERROR_MESSAGES,
  type DataAdapterAsyncOptions,
  type DataAdapterSyncOptions,
  type StatsigUser,
  type StatsigUserInternal,
} from "@statsig/client-core";
import {
  ExtensionStatsigDiagnostics as Diagnostics,
  type StatsigSyncType,
} from "./statsig_diagnostics";

// These are runtime-private SDK members. The final client supplies the real
// store, adapter, logger and error boundary before binding this lifecycle.
export interface StatsigClientLifecycleHost {
  [key: string]: any;
  _sdkKey: string;
  _user: StatsigUserInternal;
  loadingStatus: string;
}

/** Bundled Vm lifecycle deltas. Methods retain dynamic dispatch through this. */
export const statsigClientLifecycle = {
  initializeSync(
    this: StatsigClientLifecycleHost,
    options?: DataAdapterSyncOptions,
  ) {
    if (this.loadingStatus !== "Uninitialized") {
      return createUpdateDetails(
        true,
        this._store.getSource(),
        -1,
        null,
        null,
        ["MultipleInitializations", ...(this._store.getWarnings() ?? [])],
      );
    }
    this._logger.start();
    const result = this.updateUserSync(this._user, options);
    this._startLiveValuesAutoRefresh();
    return result;
  },

  async initializeAsync(
    this: StatsigClientLifecycleHost,
    options?: DataAdapterAsyncOptions,
  ) {
    if (this._initializePromise) return this._initializePromise;
    const pending = this._initializeAsyncImpl(options);
    this._initializePromise = pending;
    const result = await pending;
    if (this._initializePromise === pending) this._startLiveValuesAutoRefresh();
    return result;
  },

  async _initializeAsyncImpl(
    this: StatsigClientLifecycleHost,
    options?: DataAdapterAsyncOptions,
  ) {
    const start = performance.now();
    if (!Storage.isReady()) await Storage.isReadyResolver();
    this._logger.start();
    try {
      return await this._updateUserAsyncImpl(this._user, options, "initialize");
    } catch (error) {
      return this._createErrorUpdateDetails(
        error instanceof Error ? error : new Error(String(error)),
        start,
      );
    }
  },

  async updateUserAsync(
    this: StatsigClientLifecycleHost,
    user: StatsigUser,
    options?: DataAdapterAsyncOptions,
  ) {
    const start = performance.now();
    try {
      return await this._updateUserAsyncImpl(user, options, "update_user");
    } catch (error) {
      return this._createErrorUpdateDetails(
        error instanceof Error ? error : new Error(String(error)),
        start,
      );
    }
  },

  async refreshValuesAsync(
    this: StatsigClientLifecycleHost,
    options?: DataAdapterAsyncOptions,
  ) {
    const start = performance.now();
    try {
      return await this._refreshValuesAsyncImpl(options);
    } catch (error) {
      return this._createErrorUpdateDetails(
        error instanceof Error ? error : new Error(String(error)),
        start,
      );
    }
  },

  async _updateUserAsyncImpl(
    this: StatsigClientLifecycleHost,
    user: StatsigUser,
    options: DataAdapterAsyncOptions | undefined,
    syncType: StatsigSyncType,
  ) {
    this._resetForUser(user);
    const currentUser = this._user;
    Diagnostics._markInitOverallStart(this._sdkKey, syncType);
    let data = this.dataAdapter.getDataSync(currentUser);
    this._store.setValues(data, this._user);
    this._setStatus("Loading", data);
    data = await this.dataAdapter.getDataAsync(data, currentUser, options);
    if (currentUser !== this._user) {
      return createUpdateDetails(
        false,
        this._store.getSource(),
        -1,
        new Error("User changed during update"),
        this._network.getLastUsedInitUrlAndReset(),
      );
    }
    let success = false;
    if (data != null) {
      Diagnostics._markInitProcessStart(this._sdkKey, syncType);
      success = this._store.setValues(data, this._user, data.receivedAt);
      Diagnostics._markInitProcessEnd(this._sdkKey, { success }, syncType);
    }
    this._finalizeUpdate(data);
    if (!success) {
      this._errorBoundary.attachErrorIfNoneExists(
        UPDATE_DETAIL_ERROR_MESSAGES.NO_NETWORK_DATA,
      );
      this.$emt({ name: "initialization_failure" });
    }
    Diagnostics._markInitOverallEnd(
      this._sdkKey,
      success,
      this._store.getCurrentSourceDetails(),
      syncType,
    );
    const duration = Diagnostics._enqueueDiagnosticsEvent(
      this._user,
      this._logger,
      this._sdkKey,
      this._options,
      syncType,
    );
    return createUpdateDetails(
      success,
      this._store.getSource(),
      duration,
      this._errorBoundary.getLastSeenErrorAndReset(),
      this._network.getLastUsedInitUrlAndReset(),
      this._store.getWarnings(),
    );
  },

  async _refreshValuesAsyncImpl(
    this: StatsigClientLifecycleHost,
    options?: DataAdapterAsyncOptions,
  ) {
    const syncType = "refresh_values";
    const currentUser = this._user;
    Diagnostics._markInitOverallStart(this._sdkKey, syncType);
    const cached = this.dataAdapter.getDataSync(currentUser);
    const data = await this.dataAdapter.getDataAsync(
      cached,
      currentUser,
      options,
    );
    if (currentUser !== this._user) {
      return createUpdateDetails(
        false,
        this._store.getSource(),
        -1,
        new Error("User changed during refresh"),
        this._network.getLastUsedInitUrlAndReset(),
      );
    }
    let success = false;
    if (data != null) {
      Diagnostics._markInitProcessStart(this._sdkKey, syncType);
      success = this._store.setValues(data, this._user, data.receivedAt);
      Diagnostics._markInitProcessEnd(this._sdkKey, { success }, syncType);
    }
    this._finalizeUpdate(data);
    if (!success)
      this._errorBoundary.attachErrorIfNoneExists(
        UPDATE_DETAIL_ERROR_MESSAGES.NO_NETWORK_DATA,
      );
    Diagnostics._markInitOverallEnd(
      this._sdkKey,
      success,
      this._store.getCurrentSourceDetails(),
      syncType,
    );
    const duration = Diagnostics._enqueueDiagnosticsEvent(
      this._user,
      this._logger,
      this._sdkKey,
      this._options,
      syncType,
    );
    return createUpdateDetails(
      success,
      this._store.getSource(),
      duration,
      this._errorBoundary.getLastSeenErrorAndReset(),
      this._network.getLastUsedInitUrlAndReset(),
      this._store.getWarnings(),
    );
  },
};
