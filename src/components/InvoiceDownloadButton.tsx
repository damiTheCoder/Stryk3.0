import ReactPDF from '@react-pdf/renderer'
import { InvoicePdf, type InvoicePdfData } from '@/lib/invoicePdf'

const { PDFDownloadLink } = ReactPDF

interface Props {
  data: InvoicePdfData
}

export function InvoiceDownloadButton({ data }: Props) {
  const filename = `Invoice-${data.invoiceId.toString()}.pdf`

  return (
    <PDFDownloadLink document={<InvoicePdf data={data} />} fileName={filename}>
      {({ loading }: { loading: boolean }) => (
        <button
          disabled={loading}
          className="rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
        >
          {loading ? 'Building…' : '↓ Receipt'}
        </button>
      )}
    </PDFDownloadLink>
  )
}
