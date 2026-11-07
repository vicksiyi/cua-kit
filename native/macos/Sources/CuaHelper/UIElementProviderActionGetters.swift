import ApplicationServices
import Foundation
import os

extension UIElementProtocol {
    // 0x1007916b0: read native actions once, append disclosure only on success.
    var actions: [UIElementAction] {
        uiElementActions(readActions: { try axElement.actions },
            isDisclosable: { isDisclosable }, isDisclosing: { isDisclosing },
            reportError: { error in
                // 0x1007917b4 logger(Self), .error via GOT 0x101469b40;
                // role uses String(describing:), error bridges to NSError.
                NativeLogger.logger(for: Self.self).error("log[da1f5cd320487f18bcab] [0]=\(String(describing: role)) [1]=\(error as NSError)")
            })
    }

    // 0x100791a48 -> 0x100792570: preserve order and duplicate actions.
    var actionDescriptions: [UIElementActionDescription] {
        uiElementActionDescriptions(readActions: { actions },
            readNativeDescription: { try axElement.description(for: $0) },
            reportError: { error in
                NativeLogger.logger(for: Self.self).error("log[229981a078c5701cec51] [0]=\(String(describing: role)) [1]=\(error as NSError)")
            })
    }
}
