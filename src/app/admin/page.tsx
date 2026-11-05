import { Admin } from "@/components/admin";
export const metadata = {
  title: "مدیریت",
  robots: { index: false, follow: false },
};
export default function AdminPage() {
  return (
    <main id="main" className="shell guide-page">
      <h1>مدیریت کُنج</h1>
      <Admin />
    </main>
  );
}
