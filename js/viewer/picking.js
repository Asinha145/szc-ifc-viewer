/**
 * Pointer interaction on the viewport:
 *   click            -> select (empty click clears)
 *   ctrl+click       -> toggle element in/out of the selection
 *   shift+drag       -> marquee/box select (ctrl+shift+drag adds to selection)
 *
 * The marquee listener runs in the capture phase so it can disable
 * OrbitControls before the controls' own pointerdown handler fires.
 */
const CLICK_TOLERANCE_PX = 5;

export function attachPicking(viewer, state, marqueeEl) {
  const dom = viewer.renderer.domElement;
  let down = null;      // { x, y, ctrl }
  let marquee = null;   // { x1, y1, x2, y2, additive }

  dom.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.shiftKey) {
      marquee = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY, additive: e.ctrlKey };
      viewer.controls.enabled = false;
      dom.setPointerCapture(e.pointerId);
      updateMarqueeBox();
      marqueeEl.hidden = false;
    } else {
      down = { x: e.clientX, y: e.clientY, ctrl: e.ctrlKey };
    }
  }, true);

  dom.addEventListener("pointermove", (e) => {
    if (!marquee) return;
    marquee.x2 = e.clientX;
    marquee.y2 = e.clientY;
    updateMarqueeBox();
  }, true);

  dom.addEventListener("pointerup", (e) => {
    if (e.button !== 0) return;

    if (marquee) {
      marqueeEl.hidden = true;
      viewer.controls.enabled = true;
      const { x1, y1, x2, y2, additive } = marquee;
      marquee = null;
      const dragged = Math.abs(x2 - x1) > CLICK_TOLERANCE_PX || Math.abs(y2 - y1) > CLICK_TOLERANCE_PX;
      if (!dragged) return;
      const ids = viewer.elementsInRect(x1, y1, x2, y2);
      if (additive) state.addToSelection(ids);
      else state.setSelection(ids);
      return;
    }

    if (!down) return;
    const moved = Math.abs(e.clientX - down.x) > CLICK_TOLERANCE_PX
      || Math.abs(e.clientY - down.y) > CLICK_TOLERANCE_PX;
    const ctrl = down.ctrl;
    down = null;
    if (moved) return; // it was an orbit/pan drag, not a click

    const hit = viewer.pick(e.clientX, e.clientY);
    if (ctrl) {
      if (hit !== null) state.toggleSelection(hit);
    } else {
      state.setSelection(hit !== null ? [hit] : []);
    }
  }, true);

  dom.addEventListener("pointercancel", () => {
    if (marquee) {
      marquee = null;
      marqueeEl.hidden = true;
      viewer.controls.enabled = true;
    }
    down = null;
  }, true);

  function updateMarqueeBox() {
    const host = marqueeEl.parentElement.getBoundingClientRect();
    const left = Math.min(marquee.x1, marquee.x2) - host.left;
    const top = Math.min(marquee.y1, marquee.y2) - host.top;
    marqueeEl.style.left = `${left}px`;
    marqueeEl.style.top = `${top}px`;
    marqueeEl.style.width = `${Math.abs(marquee.x2 - marquee.x1)}px`;
    marqueeEl.style.height = `${Math.abs(marquee.y2 - marquee.y1)}px`;
  }
}
