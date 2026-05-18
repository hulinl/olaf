import { redirect } from "next/navigation";

export default function AdminIndex() {
  // /admin is the sidebar host — landing straight on Komunity keeps the
  // experience predictable (you always see something useful at /admin).
  redirect("/admin/komunity");
}
