import * as XLSX from "xlsx"

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_., ]/gi, "").replace(/\s+/g, "_").trim()
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0])
  const escapeCell = (value: unknown): string => {
    const str = value === null || value === undefined ? "" : String(value)
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h])).join(","))
  }
  return lines.join("\r\n")
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]): void {
  const csv = toCSV(rows)
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = sanitizeFilename(filename).endsWith(".csv") ? sanitizeFilename(filename) : `${sanitizeFilename(filename)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function downloadExcel(filename: string, rows: Record<string, unknown>[], sheetName = "Data"): void {
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet["!cols"] = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.min(Math.max(key.length, ...rows.map((r) => String(r[key] ?? "").length)) + 2, 60),
  }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31))
  XLSX.writeFile(workbook, sanitizeFilename(filename).endsWith(".xlsx") ? sanitizeFilename(filename) : `${sanitizeFilename(filename)}.xlsx`)
}

interface PrintableColumn {
  header: string
  value: (row: Record<string, unknown>) => string
}

export function printReport(
  title: string,
  subtitle: string,
  columns: PrintableColumn[],
  rows: Record<string, unknown>[],
  meta?: { label: string; value: string }[]
): void {
  const appendStyle = (): string =>
    `<style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1a1d29; padding: 16px; }
      .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #ff7900; padding-bottom: 12px; margin-bottom: 16px; }
      .brand { display: flex; align-items: center; gap: 10px; }
      .brand .logo { width: 40px; height: 40px; border-radius: 8px; background: #ff7900; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
      .brand h1 { font-size: 18px; line-height: 1.2; }
      .brand p { font-size: 12px; color: #6b7280; }
      .meta { display: flex; gap: 24px; flex-wrap: wrap; font-size: 12px; color: #374151; margin-bottom: 14px; }
      .meta span b { color: #1a1d29; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #1a1d29; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; white-space: nowrap; }
      td { border-bottom: 1px solid #e5e7eb; padding: 7px 10px; vertical-align: middle; }
      tr:nth-child(even) td { background: #f8fafc; }
      .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; display: flex; justify-content: space-between; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
      .badge.green { background: #dcfce7; color: #15803d; }
      .badge.red { background: #fee2e2; color: #b91c1c; }
      .badge.yellow { background: #fef9c3; color: #a16207; }
      .badge.gray { background: #f3f4f6; color: #4b5563; }
      @media print { body { padding: 0; } .no-print { display: none !important; } }
    </style>`

  const table = `
    <table>
      <thead><tr>${columns.map((c) => `<th>${c.header}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map((row) => {
          const cells = columns.map((c) => rv(c.value(row)))
          // color-code "Rate"/"Attendance %" type cells
          const rateIdx = columns.findIndex((c) => /rate/i.test(c.header))
          if (rateIdx >= 0) {
            const v = parseFloat(String(cells[rateIdx]).replace("%", ""))
            if (!isNaN(v)) {
              cells[rateIdx] = `<span class="badge ${v >= 80 ? "green" : v >= 60 ? "yellow" : "red"}">${cells[rateIdx]}</span>`
            }
          }
          return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`
        }).join("")}
      </tbody>
    </table>`

  const metaHtml = (meta?.length ?? 0) > 0
    ? `<div class="meta">${meta!.map((m) => `<span><b>${m.label}:</b> ${m.value}</span>`).join("")}</div>`
    : ""

  const printWindow = window.open("", "_blank", "width=1100,height=800")
  if (!printWindow) {
    alert("Please allow pop-ups to print the report.")
    return
  }
  printWindow.document.write(
    `<!DOCTYPE html><html><head><title>${title}</title>${appendStyle()}</head><body>` +
      `<div class="header"><div class="brand"><div class="logo">SL</div><div><h1>${title}</h1><p>${subtitle}</p></div></div><div>Orange Sierra Leone — Workforce Attendance</div></div>` +
      metaHtml +
      table +
      `<div class="footer"><span>Generated: ${new Date().toLocaleString()}</span><span>${rows.length} record${rows.length === 1 ? "" : "s"}</span></div>` +
      `</body></html>`
  )
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => printWindow.print(), 300)
}

function rv(value: string): string {
  return value === "undefined" || value === "null" ? "—" : value
}

export function printElement(title: string, subtitle: string): void {
  const content = document.getElementById("printable-area")
  if (!content) return
  const width = Math.max(720, content.scrollWidth)
  const printWindow = window.open("", "_blank", `width=${width},height=800`)
  if (!printWindow) {
    alert("Please allow pop-ups to print.")
    return
  }
  const header = `
    <div class="header">
      <div class="brand"><div class="logo">SL</div><div><h1>${title}</h1><p>${subtitle}</p></div></div>
      <div style="font-size:12px;color:#6b7280;text-align:right;">Orange Digital Center<br/>Attendance System</div>
    </div>`
  printWindow.document.write(
    `<!DOCTYPE html><html><head><title>${title}</title><style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1a1d29; padding: 16px; display: flex; gap: 24px; align-items: flex-start; }
      .brand { display: flex; align-items: center; gap: 10px; }
      .brand .logo { width: 40px; height: 40px; border-radius: 8px; background: #ff7900; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
      .brand h1 { font-size: 18px; line-height: 1.2; }
      .brand p { font-size: 12px; color: #6b7280; }
      .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #ff7900; padding-bottom: 12px; margin-bottom: 16px; width: 100%; }
      .header-content { width: 100% !important; }
      #printable-area { width: 100% !important; }
      table { border-collapse: collapse; font-size: 12px; width: 100%; }
      th { background: #1a1d29; color: #fff; text-align: left; padding: 8px 10px; }
      td { border-bottom: 1px solid #e5e7eb; padding: 7px 10px; }
      .btn-wrap { width: 100%; }
      @media print { .no-print { display: none !important; } body { padding: 0; } }
    </style></head><body><div class="header-content">${header}${content.outerHTML}</div></body></html>`
  )
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => printWindow.print(), 300)
}