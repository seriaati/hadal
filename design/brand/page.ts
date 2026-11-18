import { Display, Frame } from "../../src/web/pixel/frame";
import { drawOg } from "./og";

// The frame is 240 by 126, drawn 5 times larger: 1200 by 630, the size of a link preview.
// `Display.fit` takes its scale from the window, so it is told of a window 900 high; the screenshot keeps the top 630.
Object.defineProperty(window, "innerWidth", { value: 1200 });
Object.defineProperty(window, "innerHeight", { value: 900 });
const [pixels, glow] = [...document.querySelectorAll("canvas")] as [HTMLCanvasElement, HTMLCanvasElement];
const frame = new Frame();
const display = new Display(pixels, glow);
display.fit(frame);
frame.resize(240, 126);
display.present(frame, drawOg(frame));
