export function getFinancialYear(date: Date): string {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(2)}`;
  }
  return `${year - 1}-${year.toString().slice(2)}`;
}

export function getReturnPeriod(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${month}${year}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function generateFinancialYears(): string[] {
  const now = new Date();
  const currentFY = getFinancialYear(now);
  const currentStartYear = parseInt(currentFY.split("-")[0]);
  const years: string[] = [];
  for (let i = 0; i < 5; i++) {
    const start = currentStartYear - i;
    years.push(`${start}-${(start + 1).toString().slice(2)}`);
  }
  return years;
}
