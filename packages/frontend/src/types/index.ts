export interface Breadcrumb {
  label: string;
  /** If omitted the breadcrumb is non-clickable (current page). */
  to?: string;
}
