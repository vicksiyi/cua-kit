import QuartzCore
import Foundation

extension LayerFilter.Name {
    public func filterType() -> any LayerFilter.FilterConvertible.Type {
        switch self {
        case .colorSaturate: return LayerFilter.ColorSaturate.self
        case .gaussianBlur: return LayerFilter.GaussianBlur.self
        case .luminanceCurveMap: return LayerFilter.LuminanceCurveMap.self
        case .luminanceToAlpha: return LayerFilter.LuminanceToAlpha.self
        case .variableBlur: return LayerFilter.VariableBlur.self
        case .sdrNormalize: return LayerFilter.SDRNormalize.self
        case .alphaThreshold: return LayerFilter.AlphaThreshold.self
        }
    }
}

extension CALayer {
    // Native 0x10102ab28: skip non-NSObject and unrecognized descriptions;
    // create each recognized concrete value and populate its projected keys.
    public var layerFilters: [any LayerFilter.FilterConvertible] {
        get {
            (filters ?? []).compactMap { value in
                guard let instance = value as? NSObject,
                      let name = LayerFilter.Name(rawValue: instance.description) else { return nil }
                return name.filterType().init().populated(from: instance)
            }
        }
        set { setLayerFilters(newValue) }
    }
}
