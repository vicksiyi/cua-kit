// Native comparison helper0x10022f734..0x10023018c. Identity/path selection
// belongs to its caller. This compares the candidate's observed attributes
// with the previous element, preserving the original short-circuit order.
func refetchableElementMatches(
    _ previous: any UIElementProtocol, candidate: any UIElementProtocol, ignoreValueChange: Bool
) -> Bool {
    guard candidate.role == previous.role else { return false }
    guard candidate.subrole == previous.subrole else { return false }
    guard candidate.roleDescription == previous.roleDescription else { return false }
    guard candidate.title == previous.title else { return false }
    // Original reads both values even when ignoreValueChange is true.
    let candidateValue = candidate.value
    let previousValue = previous.value
    guard candidateValue == previousValue || ignoreValueChange else { return false }
    guard candidate.valueDescription == previous.valueDescription else { return false }
    guard candidate.description == previous.description else { return false }
    guard candidate.placeholderValue == previous.placeholderValue else { return false }
    guard candidate.help == previous.help else { return false }
    guard candidate.identifier == previous.identifier else { return false }
    return candidate.url == previous.url
}
