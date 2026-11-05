import { SizeTable } from "@/components/size-table";
export default function SizeGuide() {
  return (
    <main id="main" className="shell guide-page">
      <h1>راهنمای اندازه</h1>
      <p>
        لباس مشابهی را روی سطح صاف اندازه بگیرید؛ اندازه بدن با عرض لباس تخت
        متفاوت است.
      </p>
      <h2>تیشرت پایه ۰۱</h2>
      <SizeTable />
      <h2>هودی پایه ۰۱</h2>
      <SizeTable hoodie />
    </main>
  );
}
