
// This is the normal voice stage's fixed anchor, independent of the hidden
// board-mode button. Caption height and the button's CSS transition cannot move it.
export function mosaicCircleCenter(width, height, unit = 1) {
  return { x: width / 2, y: height / 2 - (width < 520 ? 75 : 70) - 5 * unit };
}
