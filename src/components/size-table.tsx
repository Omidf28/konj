import { getBase } from "@/server/db";
import { formatNumber } from "@/lib/format";
export const sizeRows = [
  { size: "S", chest: 48, length: 68, sleeve: 20 },
  { size: "M", chest: 51, length: 70, sleeve: 21 },
  { size: "L", chest: 54, length: 72, sleeve: 22 },
  { size: "XL", chest: 57, length: 74, sleeve: 23 },
  { size: "XXL", chest: 60, length: 76, sleeve: 24 },
];
export function SizeTable({
  hoodie = false,
  baseId,
}: {
  hoodie?: boolean;
  baseId?: string;
}) {
  const base = getBase(baseId || (hoodie ? "hood-01" : "tee-01"));
  const rows = base?.sizeChart || sizeRows;
  return (
    <>
      <p className="notice">
        جدول مدل {base?.name}، واحد سانتی‌متر و حالت تخت؛ اطلاعات فعلی نمونه و
        نیازمند تأیید تأمین‌کننده‌اند.
      </p>
      <div className="table-scroll">
        <table>
          <caption>برچسب‌های سایز استاندارد جهانی یکسان ندارند.</caption>
          <thead>
            <tr>
              <th>سایز</th>
              <th>عرض سینه تخت</th>
              <th>طول لباس</th>
              <th>طول آستین</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.size}>
                <th>{row.size}</th>
                <td>{formatNumber(row.chest)}</td>
                <td>{formatNumber(row.length)}</td>
                <td>{formatNumber(row.sleeve)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
