extension SystemSelection {
    // Native nominal0x1012c1808, fields0x10131aa14.
    enum DifferenceBaseline {
        case initial
        case previous
    }

    // Native nominal0x1012c17ec, fields0x10131a9ec. The difference case
    // carries a labeled baseline payload; these are not three plain cases.
    enum LLMDescriptionMode {
        case difference(from: DifferenceBaseline)
        case fullTree
    }
}

extension UIElementTreeRevision {
    // Description0x100238f44..0x100238fbc requires a previous revision before
    // either diff mode. Initial mode walks references back from that previous
    // revision; matching lineage strings are not used to select a baseline.
    func descriptionDifferenceBaseline(for mode: SystemSelection.LLMDescriptionMode)
        -> UIElementTreeRevision? {
        guard case .difference(let baseline) = mode, let previousRevision else { return nil }
        switch baseline {
        case .initial: return previousRevision.lineageRootRevision
        case .previous: return previousRevision
        }
    }
}
