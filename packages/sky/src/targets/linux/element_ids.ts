import type { Window } from "../../types/full-desktop/Window";
import type { AccessibilityNode } from "../../types/full-desktop/WindowState";
type NodeData = Omit<AccessibilityNode, "children" | "to_string"> & {
  children: NodeData[];
};
export class ElementIds {
  private next_id = 0;
  private windows = new Map<number, Map<string, string>>();
  assign(tree: NodeData, window: Window, filtered: boolean): void {
    const previous = this.windows.get(window.id) ?? new Map<string, string>();
    const current = filtered ? new Map(previous) : new Map<string, string>();
    const visit = (node: NodeData) => {
      const native = node.id;
      const compact =
        current.get(native) ?? previous.get(native) ?? String(this.next_id++);
      current.set(native, compact);
      node.native_id = native;
      node.id = compact;
      node.children.forEach(visit);
    };
    visit(tree);
    this.windows.set(window.id, current);
  }
  resolve<Input extends { window?: Window; element_id?: string }>(
    input: Input,
  ): Input {
    const id = input.element_id;
    if (id == null || !/^\d+$/.test(id)) return input;
    const mapping =
      input.window == null ? undefined : this.windows.get(input.window.id);
    for (const [native, compact] of mapping ?? [])
      if (compact === id) return { ...input, element_id: native };
    throw new Error(
      `Unknown element ID ${id} for this window; refresh get_window_state()`,
    );
  }
}
