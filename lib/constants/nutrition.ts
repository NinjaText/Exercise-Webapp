/**
 * Nutrition unit conversions shared by client components, server components
 * and route handlers.
 *
 * Lives in lib/constants rather than beside the WaterTracker because that
 * component is a "use client" module: a server component importing a value
 * from it receives a client reference, not the number, so
 * `Math.round(ml / ML_PER_OZ)` silently renders NaN.
 */
export const ML_PER_OZ = 29.5735;
