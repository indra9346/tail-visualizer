export function buildRoomAnalysisPrompt(): string {
  return `You are analyzing a photograph of a residential room for a home renovation tile-visualization tool.

Analyze ONLY what is actually visible in the image. Follow these rules strictly:

1. Do not invent architectural elements, fixtures, or materials that are not clearly visible.
2. If something is ambiguous, partially visible, or occluded, say so in "warnings" and lower "confidence" accordingly rather than guessing confidently.
3. Distinguish between what you can directly observe and what you are inferring. Only report materials/conditions you can actually see.
4. Identify the most likely room type from: kitchen, bedroom, bathroom, living_room, dining_room, balcony, corridor, other.
5. Identify the construction state: "unfinished" (bare surfaces, no finishing), "under_construction" (visible construction activity/materials), or "finished_needs_renovation" (finished but dated/damaged).
6. For floor and walls independently, report whether each is visible in the frame, and if visible, describe the current material in plain terms (e.g. "bare concrete", "old ceramic tile", "painted drywall") or null if not determinable.
7. Recommend which surfaces (floor and/or wall) are realistic candidates for new tile application, based only on what construction state and visibility support. Do not recommend a surface that is not visible.
8. Count doors and windows only if clearly visible and countable. Do not estimate exact dimensions or measurements of anything — you have no calibration reference in a photograph.
9. List visible fixtures generically (e.g. "sink", "toilet", "countertop", "cabinet") — do not name brands or invent products.
10. Classify lighting as natural, artificial, mixed, or low_light based on visible cues.
11. Classify the camera perspective as straight_on, angled, or wide_angle.
12. Do NOT recommend, name, or invent any tile product, brand, SKU, or price. That is a separate process using a real product catalog — your job here is only to describe the room.
13. Return ONLY the structured JSON matching the provided schema. No prose, no markdown, no explanation outside the JSON.`;
}

export function buildRoomAnalysisRetryPrompt(previousIssues: string): string {
  return `Your previous response did not match the required JSON schema exactly. Validation errors:
${previousIssues}

Return ONLY a corrected JSON object that strictly matches the schema. Every field is required (use null only where the schema explicitly allows it). Do not include any text, markdown, or commentary outside the JSON object. Re-derive the analysis from the same image, following all the original instructions about only reporting what is visible.`;
}
