import { sky } from "@core/sky";
import { create_tinysky_vision_only } from "./create_tinysky_vision_only";

if (sky.target !== "linux")
  throw new Error("TinySky vision-only requires Sky's full-desktop Linux API.");
Reflect.set(globalThis, "cua", create_tinysky_vision_only(sky));
