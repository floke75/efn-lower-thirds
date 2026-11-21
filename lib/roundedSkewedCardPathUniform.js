/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * Which side(s) of the card are slanted.
 *
 * Cards are meant to sit in a row where the slanted edges of neighbours run
 * parallel to each other:
 *
 *   'left'   – first card in a row: straight left edge, slanted right edge
 *   'middle' – any card in between: both left and right edges slanted
 *   'right'  – last card in a row: slanted left edge, straight right edge
 *   'none'   – (or any other value) a plain rectangle
 *
 * @typedef {'left' | 'middle' | 'right' | 'none'} CardPosition
 */

/**
 * Builds an SVG path for a card with slanted sides and rounded corners,
 * where all four corners use the same radius.
 *
 * Corners are rounded with a quadratic Bézier curve (`Q`) whose control point
 * is the sharp corner itself. The curve starts and ends on the two edges that
 * meet at the corner, at the same distance from it on both sides, so every
 * rounding is symmetric.
 *
 * Because the slanted corners are not 90°, the same tangent length would make
 * them look sharper (acute corners) or softer (obtuse corners) than the square
 * ones. `angleComp` evens this out: see {@link angleCompensationFactor}.
 *
 * @example
 * const d = roundedSkewedCardPathUniform({
 *   width: 200, height: 160, skewDeg: 15, position: 'middle', radius: 16,
 * });
 * // <path d={d} />
 *
 * @param {Object} options
 * @param {number} options.width     Width of the card's bounding box.
 * @param {number} options.height    Height of the card.
 * @param {number} options.skewDeg   Slant of the angled edges, in degrees from vertical.
 * @param {CardPosition} options.position  Which edges are slanted.
 * @param {number} [options.radius=0]      Corner radius. 0 gives sharp corners.
 * @param {number} [options.angleComp=0.4] How much to adjust the radius for
 *   non-square corners: 0 = no adjustment, 1 = full adjustment so every corner
 *   matches a circle of `radius`.
 * @returns {string} SVG path data, ready for a `d` attribute.
 */
function roundedSkewedCardPathUniform({
  width,
  height,
  skewDeg,
  position,
  radius = 0,
  angleComp = 0.4,
}) {
  const corners = cardCorners(width, height, skewDeg, position);
  const roundings = corners.map((corner, i) => {
    const previous = corners[(i - 1 + corners.length) % corners.length];
    const next = corners[(i + 1) % corners.length];
    return roundCorner(previous, corner, next, radius, angleComp);
  });
  return buildPath(roundings);
}

/**
 * Returns the card's four sharp corners in clockwise order, starting top-left:
 * [topLeft, topRight, bottomRight, bottomLeft].
 *
 * A slanted edge leans to the right as it goes up. Its horizontal offset over
 * the full height is `height × tan(skew)`, so slanting the left edge moves the
 * top-left corner right, and slanting the right edge moves the bottom-right
 * corner left.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} skewDeg
 * @param {CardPosition} position
 * @returns {Point[]}
 */
function cardCorners(width, height, skewDeg, position) {
  const slantOffset = height * Math.tan(degreesToRadians(skewDeg));

  const leftEdgeSlanted = position === 'right' || position === 'middle';
  const rightEdgeSlanted = position === 'left' || position === 'middle';

  const topLeft = { x: leftEdgeSlanted ? slantOffset : 0, y: 0 };
  const topRight = { x: width, y: 0 };
  const bottomRight = { x: rightEdgeSlanted ? width - slantOffset : width, y: height };
  const bottomLeft = { x: 0, y: height };

  return [topLeft, topRight, bottomRight, bottomLeft];
}

/**
 * @typedef {Object} CornerRounding
 * @property {Point} corner     The sharp corner; used as the curve's control point.
 * @property {Point} curveStart Where the curve leaves the incoming edge.
 * @property {Point} curveEnd   Where the curve joins the outgoing edge.
 * @property {boolean} isRounded False when the corner should stay sharp.
 */

/**
 * Works out where the rounding of one corner starts and ends.
 *
 * The tangent length (how far from the corner the curve begins) is the same on
 * both edges, which keeps the curve symmetric. It is capped at half of the
 * shorter edge, so roundings on neighbouring corners can never overlap.
 *
 * @param {Point} previous The corner before this one (end of the incoming edge).
 * @param {Point} corner   The corner being rounded.
 * @param {Point} next     The corner after this one (end of the outgoing edge).
 * @param {number} radius
 * @param {number} angleComp
 * @returns {CornerRounding}
 */
function roundCorner(previous, corner, next, radius, angleComp) {
  if (radius <= 0) {
    return { corner, curveStart: corner, curveEnd: corner, isRounded: false };
  }

  const incomingEdgeLength = distance(corner, previous);
  const outgoingEdgeLength = distance(corner, next);

  const cornerAngle = angleBetween(corner, previous, next);
  const preferredLength = radius * angleCompensationFactor(cornerAngle, angleComp);
  const tangentLength = Math.min(
    preferredLength,
    incomingEdgeLength / 2,
    outgoingEdgeLength / 2,
  );

  return {
    corner,
    curveStart: moveTowards(corner, previous, tangentLength),
    curveEnd: moveTowards(corner, next, tangentLength),
    isRounded: tangentLength > 0,
  };
}

/**
 * Scales the radius so corners of different angles look equally round.
 *
 * For a true circle of radius r, the curve touches each edge at a distance of
 * r / tan(angle / 2) from the corner. That factor is 1 at 90°, larger for
 * acute corners and smaller for obtuse ones. Raising it to the power of
 * `strength` blends between no compensation (0) and full compensation (1),
 * while leaving 90° corners unaffected at any strength.
 *
 * @param {number} cornerAngle Interior angle of the corner, in radians.
 * @param {number} strength    0 to 1.
 * @returns {number} Multiplier for the radius.
 */
function angleCompensationFactor(cornerAngle, strength) {
  const fullCompensation = 1 / Math.tan(cornerAngle / 2);
  return Math.pow(fullCompensation, strength);
}

/**
 * Turns the corner roundings into SVG path data.
 *
 * The path starts where the first corner's curve ends, then for each following
 * corner draws a straight line to where its curve starts, followed by the curve
 * itself. The last step wraps back to the first corner, and `Z` closes the shape.
 *
 * @param {CornerRounding[]} roundings
 * @returns {string}
 */
function buildPath(roundings) {
  const first = roundings[0];
  let d = `M ${formatPoint(first.curveEnd)} `;

  for (let i = 1; i <= roundings.length; i++) {
    const { corner, curveStart, curveEnd, isRounded } = roundings[i % roundings.length];
    d += `L ${formatPoint(curveStart)} `;
    if (isRounded) {
      d += `Q ${formatPoint(corner)} ${formatPoint(curveEnd)} `;
    }
  }

  return d + 'Z';
}

// ---------------------------------------------------------------------------
// Small geometry helpers
// ---------------------------------------------------------------------------

/** @param {number} degrees @returns {number} */
function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Straight-line distance between two points. @param {Point} a @param {Point} b */
function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The point `length` units from `from`, in the direction of `to`.
 * @param {Point} from @param {Point} to @param {number} length @returns {Point}
 */
function moveTowards(from, to, length) {
  const total = distance(from, to);
  return {
    x: from.x + ((to.x - from.x) / total) * length,
    y: from.y + ((to.y - from.y) / total) * length,
  };
}

/**
 * Interior angle at `vertex` between the lines to `a` and `b`, in radians.
 * @param {Point} vertex @param {Point} a @param {Point} b @returns {number}
 */
function angleBetween(vertex, a, b) {
  const dot = (a.x - vertex.x) * (b.x - vertex.x) + (a.y - vertex.y) * (b.y - vertex.y);
  const cos = dot / (distance(vertex, a) * distance(vertex, b));
  return Math.acos(Math.max(-1, Math.min(1, cos))); // clamp guards against rounding errors
}

/** "x,y" with two decimals, as used in SVG path data. @param {Point} p */
function formatPoint(p) {
  return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
}

// Added for Node use in this repo (browser code can import the functions directly).
if (typeof module !== "undefined") module.exports = { roundedSkewedCardPathUniform, cardCorners };
