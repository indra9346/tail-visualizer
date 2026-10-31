/** Photos uploaded without a customer name are kept together in this project (shown as "Walk-in customers"). */
export const DEFAULT_PROJECT_NAME = "My rooms";
/** Sample rooms tried without a customer photo are kept apart from real customers. */
export const SAMPLE_PROJECT_NAME = "Sample rooms";

/** A project's name as the owner says it: the default project is a walk-in customer. */
export function customerName(projectName: string | null | undefined): string | null {
  if (!projectName) return null;
  if (projectName === DEFAULT_PROJECT_NAME) return "Walk-in customer";
  if (projectName === SAMPLE_PROJECT_NAME) return "Sample room";
  return projectName;
}
