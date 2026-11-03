/** Installed bundle dp/HC/WC/si/pp/sl, preserving distribution and channel sharing. */
export const chromeBetaDistribution = {
  distribution: "chrome-web-store",
  extensionIds: ["lfkehkpjohcoelkpembgemeipeppanef"],
  outputModes: [],
  releaseChannel: "beta",
  signingIdentity: null,
  storeUrl:
    "https://chromewebstore.google.com/detail/codex/lfkehkpjohcoelkpembgemeipeppanef",
};
export const chromeStableDistribution = {
  distribution: "chrome-web-store",
  extensionIds: ["hehggadaopoacecdllhhajmbjkdcmajg"],
  outputModes: [],
  releaseChannel: "stable",
  signingIdentity: null,
  storeUrl:
    "https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg",
};
export const edgeStableDistribution = {
  distribution: "microsoft-edge-add-ons",
  extensionIds: ["odlomjlbamekndcpllcnffbgeohgkmjh"],
  outputModes: [],
  releaseChannel: "stable",
  signingIdentity: null,
  storeUrl:
    "https://microsoftedge.microsoft.com/addons/detail/odlomjlbamekndcpllcnffbgeohgkmjh",
};
export const extensionDistributions = {
  chrome: {
    dev: [
      {
        distribution: "local-development",
        extensionIds: [],
        outputModes: ["file"],
        releaseChannel: "dev",
        signingIdentity: "development",
      },
      {
        distribution: "managed-self-hosted",
        extensionIds: [],
        outputModes: ["file"],
        releaseChannel: "dev",
        signingIdentity: "development",
      },
      chromeBetaDistribution,
    ],
    internal: [
      {
        distribution: "managed-self-hosted",
        extensionIds: [],
        outputModes: ["file", "blobstore"],
        releaseChannel: "beta",
        signingIdentity: "beta",
      },
      chromeBetaDistribution,
    ],
    prod: [
      {
        distribution: "managed-self-hosted",
        extensionIds: [],
        outputModes: ["file"],
        releaseChannel: "stable",
        signingIdentity: "stable",
      },
      chromeStableDistribution,
    ],
  },
  edge: {
    dev: [
      {
        distribution: "local-development",
        extensionIds: [],
        outputModes: ["file"],
        releaseChannel: "dev",
        signingIdentity: "development",
      },
      {
        distribution: "managed-self-hosted",
        extensionIds: [],
        outputModes: ["file"],
        releaseChannel: "dev",
        signingIdentity: "development",
      },
      chromeBetaDistribution,
    ],
    internal: [
      {
        distribution: "managed-self-hosted",
        extensionIds: [],
        outputModes: ["file", "blobstore"],
        releaseChannel: "beta",
        signingIdentity: "beta",
      },
      edgeStableDistribution,
      chromeBetaDistribution,
    ],
    prod: [
      {
        distribution: "managed-self-hosted",
        extensionIds: [],
        outputModes: ["file"],
        releaseChannel: "stable",
        signingIdentity: "stable",
      },
      edgeStableDistribution,
      chromeStableDistribution,
    ],
  },
};
export const chromiumExtensionChannels = {
  dev: { distributions: extensionDistributions.chrome.dev },
  internal: { distributions: extensionDistributions.chrome.internal },
  prod: { distributions: extensionDistributions.chrome.prod },
};
export const browserFamilies = {
  chrome: {
    backendCompatibilityKey: "chrome",
    displayName: "Google Chrome",
    browserIconAssetPath: "assets/google-chrome.png",
    shortDisplayName: "Chrome",
    userAgentIdentifiers: ["Chrome/"],
    internalUrlSchemes: ["chrome"],
    extensionManagementUrl: "chrome://extensions",
    extensionChannels: chromiumExtensionChannels,
    linux: {
      installations: [
        {
          commands: ["google-chrome", "google-chrome-stable"],
          userDataDirName: "google-chrome",
        },
        {
          commands: ["chromium", "chromium-browser"],
          userDataDirName: "chromium",
        },
        {
          commands: ["google-chrome-beta"],
          userDataDirName: "google-chrome-beta",
        },
        {
          commands: ["google-chrome-unstable"],
          userDataDirName: "google-chrome-unstable",
        },
        {
          commands: ["google-chrome-for-testing"],
          userDataDirName: "google-chrome-for-testing",
        },
      ],
      nativeMessagingManifestDirectories: [
        ".config/google-chrome/NativeMessagingHosts",
        ".config/chromium/NativeMessagingHosts",
        ".config/google-chrome-beta/NativeMessagingHosts",
        ".config/google-chrome-unstable/NativeMessagingHosts",
        ".config/google-chrome-for-testing/NativeMessagingHosts",
      ],
      processNames: ["chrome"],
      userDataDirectorySegments: [".config", "google-chrome"],
    },
    macos: {
      applicationNames: ["Google Chrome.app"],
      bundleId: "com.google.Chrome",
      nativeMessagingManifestDirectories: [
        "Library/Application Support/Google/Chrome/NativeMessagingHosts",
        "Library/Application Support/Chromium/NativeMessagingHosts",
        "Library/Application Support/Google/ChromeForTesting/NativeMessagingHosts",
        "Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts",
      ],
      processNames: ["Google Chrome", "Google Chrome Helper"],
      userDataDirectorySegments: [
        "Library",
        "Application Support",
        "Google",
        "Chrome",
      ],
    },
    windows: {
      commandNames: ["chrome.exe", "chrome"],
      httpsUserChoiceProgIdPrefixes: ["chromehtml"],
      installPathSegments: ["Google", "Chrome", "Application", "chrome.exe"],
      processNames: ["chrome.exe"],
      userDataDirectorySegments: ["Google", "Chrome", "User Data"],
    },
  },
  edge: {
    backendCompatibilityKey: "chrome",
    displayName: "Microsoft Edge",
    browserIconAssetPath: "assets/microsoft-edge.svg",
    shortDisplayName: "Edge",
    userAgentIdentifiers: ["Edg/"],
    internalUrlSchemes: ["edge"],
    extensionManagementUrl: "edge://extensions",
    extensionChannels: {
      dev: { distributions: extensionDistributions.edge.dev },
      internal: { distributions: extensionDistributions.edge.internal },
      prod: { distributions: extensionDistributions.edge.prod },
    },
    linux: {
      installations: [
        {
          commands: ["microsoft-edge", "microsoft-edge-stable"],
          userDataDirName: "microsoft-edge",
        },
      ],
      nativeMessagingManifestDirectories: [
        ".config/microsoft-edge/NativeMessagingHosts",
      ],
      processNames: ["msedge"],
      userDataDirectorySegments: [".config", "microsoft-edge"],
    },
    macos: {
      applicationNames: ["Microsoft Edge.app"],
      bundleId: "com.microsoft.edgemac",
      nativeMessagingManifestDirectories: [
        "Library/Application Support/Microsoft Edge/NativeMessagingHosts",
      ],
      processNames: ["Microsoft Edge", "Microsoft Edge Helper"],
      userDataDirectorySegments: [
        "Library",
        "Application Support",
        "Microsoft Edge",
      ],
    },
    windows: {
      commandNames: ["msedge.exe", "msedge"],
      httpsUserChoiceProgIdPrefixes: ["msedgehtm"],
      installPathSegments: ["Microsoft", "Edge", "Application", "msedge.exe"],
      processNames: ["msedge.exe"],
      userDataDirectorySegments: ["Microsoft", "Edge", "User Data"],
    },
  },
  brave: {
    backendCompatibilityKey: "chrome",
    displayName: "Brave Browser",
    browserIconAssetPath: "assets/brave.svg",
    shortDisplayName: "Brave",
    userAgentIdentifiers: ["Brave/"],
    internalUrlSchemes: ["brave", "chrome"],
    extensionManagementUrl: "brave://extensions",
    extensionChannels: chromiumExtensionChannels,
    linux: {
      installations: [
        {
          commands: ["brave-browser", "brave-browser-stable", "brave"],
          userDataDirName: "BraveSoftware/Brave-Browser",
        },
      ],
      nativeMessagingManifestDirectories: [
        ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts",
      ],
      processNames: ["brave", "brave-browser"],
      userDataDirectorySegments: [".config", "BraveSoftware", "Brave-Browser"],
    },
    macos: {
      applicationNames: ["Brave Browser.app"],
      bundleId: "com.brave.Browser",
      nativeMessagingManifestDirectories: [
        "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts",
      ],
      processNames: ["Brave Browser", "Brave Browser Helper"],
      userDataDirectorySegments: [
        "Library",
        "Application Support",
        "BraveSoftware",
        "Brave-Browser",
      ],
    },
    windows: {
      commandNames: ["brave.exe", "brave", "brave-browser"],
      httpsUserChoiceProgIdPrefixes: ["bravehtml"],
      installPathSegments: [
        "BraveSoftware",
        "Brave-Browser",
        "Application",
        "brave.exe",
      ],
      processNames: ["brave.exe"],
      userDataDirectorySegments: [
        "BraveSoftware",
        "Brave-Browser",
        "User Data",
      ],
    },
  },
  opera: {
    backendCompatibilityKey: "chrome",
    displayName: "Opera",
    browserIconAssetPath: "assets/opera.svg",
    shortDisplayName: "Opera",
    userAgentIdentifiers: ["OPR/", "Opera/"],
    internalUrlSchemes: ["opera", "chrome"],
    extensionManagementUrl: "opera://extensions",
    extensionChannels: chromiumExtensionChannels,
    linux: {
      installations: [
        { commands: ["opera", "opera-stable"], userDataDirName: "opera" },
      ],
      nativeMessagingManifestDirectories: [
        ".config/opera/NativeMessagingHosts",
      ],
      processNames: ["opera"],
      userDataDirectorySegments: [".config", "opera"],
    },
    macos: {
      applicationNames: ["Opera.app"],
      bundleId: "com.operasoftware.Opera",
      nativeMessagingManifestDirectories: [
        "Library/Application Support/com.operasoftware.Opera/NativeMessagingHosts",
      ],
      processNames: ["Opera", "Opera Helper"],
      userDataDirectorySegments: [
        "Library",
        "Application Support",
        "com.operasoftware.Opera",
      ],
    },
    windows: {
      commandNames: ["opera.exe", "opera"],
      httpsUserChoiceProgIdPrefixes: ["operastable"],
      installPathSegments: ["Opera", "opera.exe"],
      processNames: ["opera.exe"],
      userDataDirectorySegments: ["Opera Software", "Opera Stable"],
    },
  },
  vivaldi: {
    backendCompatibilityKey: "chrome",
    displayName: "Vivaldi",
    browserIconAssetPath: "assets/vivaldi.svg",
    shortDisplayName: "Vivaldi",
    userAgentIdentifiers: ["Vivaldi/"],
    internalUrlSchemes: ["vivaldi", "chrome"],
    extensionManagementUrl: "vivaldi://extensions",
    extensionChannels: chromiumExtensionChannels,
    linux: {
      installations: [
        { commands: ["vivaldi", "vivaldi-stable"], userDataDirName: "vivaldi" },
      ],
      nativeMessagingManifestDirectories: [
        ".config/vivaldi/NativeMessagingHosts",
      ],
      processNames: ["vivaldi", "vivaldi-bin"],
      userDataDirectorySegments: [".config", "vivaldi"],
    },
    macos: {
      applicationNames: ["Vivaldi.app"],
      bundleId: "com.vivaldi.Vivaldi",
      nativeMessagingManifestDirectories: [
        "Library/Application Support/Vivaldi/NativeMessagingHosts",
      ],
      processNames: ["Vivaldi", "Vivaldi Helper"],
      userDataDirectorySegments: ["Library", "Application Support", "Vivaldi"],
    },
    windows: {
      commandNames: ["vivaldi.exe", "vivaldi"],
      httpsUserChoiceProgIdPrefixes: ["vivaldihtm"],
      installPathSegments: ["Vivaldi", "Application", "vivaldi.exe"],
      processNames: ["vivaldi.exe"],
      userDataDirectorySegments: ["Vivaldi", "User Data"],
    },
  },
};
/** Original ks. Only absent/null family defaults to Chrome. */
export function browserFamily(info?: { family?: string | null } | null) {
  return browserFamilies[
    (info?.family ?? "chrome") as keyof typeof browserFamilies
  ];
}
/** Original ky. Prototype keys are not supported family names. */
export function isBrowserFamily(value: PropertyKey) {
  return Object.hasOwn(browserFamilies, value);
}
