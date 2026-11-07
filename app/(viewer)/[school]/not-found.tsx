import { SchoolLinkRequired } from "@/components/public/SchoolLinkRequired";

/** Unknown or mistyped school link (incl. slugs) gets the same guidance as /schedule. */
export default function SchoolNotFound() {
  return <SchoolLinkRequired />;
}
