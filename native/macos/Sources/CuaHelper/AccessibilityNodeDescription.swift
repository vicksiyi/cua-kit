// 0x100625d58 / 0x100625d6c compose via 0x100625d80. Evaluation
// is content -> state -> role, whereas output is role -> state -> content.
extension AccessibilityNode {
    func accessibilityDescription<Context: AccessibilityRenderingContext>(
        context: inout Context
    ) -> String where Context.Role == Role {
        let content = accessibilityContentDescription(context: &context)
        let state = accessibilityStateDescription(role: role, contextType: context.type,
            isSelectable: isSelectable, isSelected: isSelected, isEnabled: isEnabled,
            isDisclosable: isDisclosable, isDisclosing: isDisclosing,
            valueTypeName: valueTypeName, isValueSettable: isValueSettable,
            isSentByCurrentUser: isSentByCurrentUser)
        let description = roleDescription
        let roleText = accessibilityRoleDescription(role: role,
            roleDescription: description, contextType: context.type)
        return [roleText, state, content].filter { !$0.isEmpty }.joined(separator: " ")
    }
}
