# Ray physics

Coordinates are arena pixels: x right, y down, field 1000 × 600. Angles are degrees clockwise from positive x. Rays are normalized vectors. Mirror angles describe the segment tangent, so a −45° mirror reflects a rightward ray upward.

For ray `o + t d` and segment `a + u(b − a)`, the cross-product solution rejects parallel lines, `t <= epsilon`, and `u` outside the segment. The nearest positive intersection wins. Absorbers stop immediately. Mirror reflection is `d' = 2(d · tangent)tangent − d`; directions are normalized after reflection.

A target is illuminated if its center-to-visible-segment distance is at most its radius. Detection never extends beyond the first obstruction. Charging belongs to the game engine, not geometry.

Defaults: 12 bounces, 2,400 total pixels; hard caps: 64 bounces, 128 surfaces, 64 targets, and 100,000 distance. EPS is 1e−7; each reflected origin advances 10 EPS and subtracts that nudge from the distance budget to avoid immediate self-intersection. Geometry inputs must be finite, bounded and nondegenerate.

Output contains ordered segments, deduplicated target IDs and `escape`, `absorbed` or `limit` termination. Pure functions make identical inputs repeatable. Tests cover intersection edge cases, nearest blockers, reflected targets, all authored solutions, bounce loops, invalid scenes, and 1,000 seeded reflection invariants. This is geometric reflection, not wave optics, diffraction, polarization or refractive prism simulation.
