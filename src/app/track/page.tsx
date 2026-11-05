import { TrackLookup } from "@/components/track-lookup";
export const metadata = {
  title: "پیگیری سفارش",
  robots: { index: false, follow: false },
};
export default function TrackPage() {
  return (
    <main id="main" className="shell guide-page">
      <h1>پیگیری سفارش</h1>
      <TrackLookup />
    </main>
  );
}
