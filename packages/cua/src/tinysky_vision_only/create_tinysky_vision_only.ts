import { image } from "../core/display";
import { positive_pixels } from "../core/positive_pixels";
import type * as T from "../tinysky_alt/types";

type Computer = Pick<T.LinuxComputer,
  "get_screenshot" | "click" | "drag" | "scroll" | "press_key">;

export function create_tinysky_vision_only(computer: Computer) {
  return {
    async screenshot() {
      const [screenshot] = await computer.get_screenshot();
      if (screenshot === undefined)
        throw new Error("Sky returned no desktop screenshot.");
      const bytes = screenshot.bytes;
      await image({ bytes });
      return bytes;
    },
    click(point: T.Point, options?: Pick<T.ClickOptions, "mouseButton" | "clickCount">) {
      const [x, y] = point;
      return computer.click({ x, y, mouse_button: options?.mouseButton, click_count: options?.clickCount });
    },
    drag(from: T.Point, to: T.Point) {
      const path = [from, to].map(([x, y]) => ({ x, y }));
      return computer.drag({ path });
    },
    scroll(point: T.Point, direction: T.Direction, distance?: { pixels: number }) {
      const [x, y] = point;
      const pixels = distance === undefined ? undefined : positive_pixels(distance.pixels);
      return computer.scroll({ x, y, direction, pixels });
    },
    pressKey: (key: string) => computer.press_key({ key }),
    async typeText(text: string) {
      if (/[^ -~]/u.test(text))
        throw new Error("typeText accepts printable ASCII text only.");
      for (const character of text) {
        let key = character;
        if (character === " ") key = "space";
        else if (character === "+") key = "plus";
        else if (/[A-Z]/u.test(character)) key = `shift+${character}`;
        await computer.press_key({ key });
      }
    },
  };
}
