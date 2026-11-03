/** Original au: already-readable page helper preserved as a serialized source string. */
export const querySelectorWithVisibleFallbackSource = `
function querySelectorStrictWithVisibleFallback(injected, parsedSelector, root, strict = false) {
  const matches = injected.querySelectorAll(parsedSelector, root);
  if (!matches.length) {
    injected.checkDeprecatedSelectorUsage(parsedSelector, matches);
    return null;
  }

  if (matches.length === 1) {
    injected.checkDeprecatedSelectorUsage(parsedSelector, matches);
    return matches[0];
  }

  if (strict) throw injected.strictModeViolationError(parsedSelector, matches);

  const visibleMatches = matches.filter((element) => {
    const state = injected.elementState(element, "visible");
    return !!state.matches;
  });
  if (visibleMatches.length === 1) return visibleMatches[0];

  throw injected.strictModeViolationError(parsedSelector, matches);
}
`;

/** Original ig.selectorScopeFunctions: embedded readable source, including same-origin frame geometry. */
export function selectorScopeFunctions(): string {
  return `
function injectedForWindow(rootInjected, targetWindow) {
  if (!targetWindow) throw new Error("Frame window is not available");
  if (targetWindow.__codexPlaywrightInjected) {
    return targetWindow.__codexPlaywrightInjected;
  }

  targetWindow.__codexPlaywrightInjected = new rootInjected.constructor(targetWindow, {
    isUnderTest: false,
    sdkLanguage: "javascript",
    testIdAttributeName: "data-testid",
    stableRafCount: 1,
    browserName: "chromium",
    customEngines: [],
  });
  return targetWindow.__codexPlaywrightInjected;
}

const unsupportedFrameAccessMessage =
  "Cross-origin or out-of-process iframes are not supported by this runtime selector path";

function sliceParsedSelector(parsedSelector, startIndex, endIndex) {
  const sliced = {
    ...parsedSelector,
    parts: parsedSelector.parts.slice(startIndex, endIndex),
  };

  if (parsedSelector.capture === undefined) {
    delete sliced.capture;
  } else if (
    parsedSelector.capture >= startIndex &&
    parsedSelector.capture < endIndex
  ) {
    sliced.capture = parsedSelector.capture - startIndex;
  } else {
    delete sliced.capture;
  }

  return sliced;
}

function frameContentSize(frameElement) {
  const rect = frameElement.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    throw new Error("Frame does not have an actionable bounding box");
  }

  const clientWidth = Number(frameElement.clientWidth) || rect.width;
  const clientHeight = Number(frameElement.clientHeight) || rect.height;
  if (clientWidth <= 0 || clientHeight <= 0) {
    throw new Error("Frame does not have an actionable bounding box");
  }

  return {
    height: clientHeight,
    width: clientWidth,
  };
}

function frameContentGeometry(frameElement) {
  const rect = frameElement.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    throw new Error("Frame does not have an actionable bounding box");
  }

  const offsetWidth = Number(frameElement.offsetWidth) || rect.width;
  const offsetHeight = Number(frameElement.offsetHeight) || rect.height;
  const clientWidth = Number(frameElement.clientWidth);
  const clientHeight = Number(frameElement.clientHeight);
  if (
    offsetWidth <= 0 ||
    offsetHeight <= 0 ||
    clientWidth <= 0 ||
    clientHeight <= 0
  ) {
    throw new Error("Frame does not have an actionable bounding box");
  }

  const scaleX = rect.width / offsetWidth;
  const scaleY = rect.height / offsetHeight;
  return {
    left: rect.left + (Number(frameElement.clientLeft) || 0) * scaleX,
    scaleX,
    scaleY,
    top: rect.top + (Number(frameElement.clientTop) || 0) * scaleY,
  };
}

function pointThroughFrameElement(point, frameElement) {
  const geometry = frameContentGeometry(frameElement);
  return {
    x: geometry.left + point.x * geometry.scaleX,
    y: geometry.top + point.y * geometry.scaleY,
  };
}

function prepareFrameChainForPointerAction(frameChain, point, scrollAlignment) {
  const block = scrollAlignment?.block ?? "center";
  const inline = scrollAlignment?.inline ?? "nearest";
  let currentPoint = point;

  for (const frameScope of frameChain.slice().reverse()) {
    frameScope.element.scrollIntoView({
      block,
      inline,
      behavior: "instant",
    });

    const state = frameScope.injected.elementState(frameScope.element, "visible");
    if (state.received === "error:notconnected") {
      throw new Error("Frame is not connected");
    }

    if (!state.matches) {
      throw new Error("Frame is not visible");
    }

    currentPoint = pointThroughFrameElement(currentPoint, frameScope.element);
  }

  return currentPoint;
}

function selectorScopeFor(initialInjected, parsedSelector, strict = false) {
  let currentRoot = document;
  let currentInjected = initialInjected;
  const frameChain = [];
  let partStart = 0;

  while (true) {
    const enterFrameIndex = parsedSelector.parts.findIndex(
      (part, index) =>
        index >= partStart &&
        part.name === "internal:control" &&
        part.body === "enter-frame"
    );

    if (enterFrameIndex === -1) {
      return {
        frameChain,
        injected: currentInjected,
        prepareFrameChainForPointerAction: (point, scrollAlignment) =>
          prepareFrameChainForPointerAction(frameChain, point, scrollAlignment),
        root: currentRoot,
        parsed: sliceParsedSelector(
          parsedSelector,
          partStart,
          parsedSelector.parts.length
        ),
      };
    }

    const frameSelector = sliceParsedSelector(
      parsedSelector,
      partStart,
      enterFrameIndex
    );
    const frameElement = querySelectorStrictWithVisibleFallback(
      currentInjected,
      frameSelector,
      currentRoot,
      strict
    );

    if (!frameElement) return null;
    const tagName = String(frameElement.localName || frameElement.tagName || "").toLowerCase();
    if (tagName !== "iframe" && tagName !== "frame") {
      throw new Error("internal:control=enter-frame must target a frame element");
    }

    let frameWindow;
    let frameDocument;
    try {
      frameWindow = frameElement.contentWindow;
      frameDocument = frameElement.contentDocument || frameWindow?.document;
    } catch {
      throw new Error(unsupportedFrameAccessMessage);
    }

    if (!frameWindow || !frameDocument) {
      throw new Error(unsupportedFrameAccessMessage);
    }

    frameChain.push({ element: frameElement, injected: currentInjected });
    currentRoot = frameDocument;
    currentInjected = injectedForWindow(initialInjected, frameWindow);
    partStart = enterFrameIndex + 1;
  }
}
`;
}
