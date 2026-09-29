/// <reference types="vite/client" />
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import logoUrl from '/veo-logo.png?url'

// ─── Public API ───────────────────────────────────────────────────────────────

export interface InvoicePdfData {
  invoiceId: string | number | bigint
  creator: string
  client: string             // may be truncated, e.g. "0x46A5…D565"
  clientEmail?: string
  amount: string             // raw uint256 as string, in 6-decimal USDC
  amountFormatted: string    // display form, e.g. "5.00 USDC"
  description: string
  dueDate: number            // unix seconds
  issueDate?: number         // unix seconds (optional)
  paymentAddress: string     // creator's wallet for receiving USDC
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingLeft: 40,
    paddingRight: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },

  // Watermark — behind all content (first child, absolutely positioned)
  watermarkWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermarkImage: {
    width: 320,
    height: 320,
    opacity: 0.035,
  },
  watermarkWrapper: {
    width: 320,
    height: 320,
    borderRadius: 64,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  logoWrapper: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
  },
  logo: {
    width: 80,
    height: 80,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  invoiceLabel: {
    fontSize: 9,
    letterSpacing: 2,
    color: '#666666',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#111111',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },

  // Section rows (two-column layout)
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sectionBlock: {
    flex: 1,
  },
  sectionBlockRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 1,
    color: '#666666',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionValue: {
    fontSize: 11,
    color: '#111111',
  },
  sectionValueMuted: {
    fontSize: 10,
    color: '#555555',
    marginTop: 3,
  },
  amountValue: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#111111',
  },

  // Description block
  descriptionBlock: {
    marginBottom: 24,
  },
  descriptionText: {
    fontSize: 10,
    color: '#333333',
    lineHeight: 1.5,
  },

  // Footer — no marginTop:'auto'; a flex spacer pushes it to the bottom instead
  footer: {},
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  totalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#111111',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#111111',
  },
  paymentTitle: {
    fontSize: 9,
    letterSpacing: 1,
    color: '#666666',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  paymentAddress: {
    fontSize: 10,
    color: '#333333',
    fontFamily: 'Helvetica',
  },
  brandNote: {
    fontSize: 8,
    color: '#AAAAAA',
    marginTop: 12,
  },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoicePdf({ data }: { data: InvoicePdfData }): React.ReactElement {
  const id = data.invoiceId.toString()

  // Resolve issue date: provided, or dueDate minus 30 days
  const issueDateSec = data.issueDate ?? data.dueDate - 30 * 24 * 60 * 60
  const issueDateStr = formatDate(issueDateSec)
  const dueDateStr   = formatDate(data.dueDate)

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Watermark (first child — renders behind static content) ── */}
        <View style={styles.watermarkWrap} fixed>
          <View style={styles.watermarkWrapper}>
            <Image src={logoUrl} style={styles.watermarkImage} />
          </View>
        </View>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.logoWrapper}>
            <Image src={logoUrl} style={styles.logo} />
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceLabel}>Invoice</Text>
            <Text style={styles.invoiceNumber}>INVOICE #{id}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Row 1: Billed To | Amount Due ── */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Billed To</Text>
            <Text style={styles.sectionValue}>{data.client || '—'}</Text>
            {!!data.clientEmail && (
              <Text style={styles.sectionValueMuted}>{data.clientEmail}</Text>
            )}
          </View>
          <View style={styles.sectionBlockRight}>
            <Text style={styles.sectionLabel}>Amount Due</Text>
            <Text style={styles.amountValue}>{data.amountFormatted || '—'}</Text>
          </View>
        </View>

        {/* ── Row 2: Issued | Due Date ── */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionLabel}>Issued</Text>
            <Text style={styles.sectionValue}>{issueDateStr}</Text>
          </View>
          <View style={styles.sectionBlockRight}>
            <Text style={styles.sectionLabel}>Due Date</Text>
            <Text style={styles.sectionValue}>{dueDateStr}</Text>
          </View>
        </View>

        {/* ── Row 3: Description ── */}
        {!!data.description && (
          <View style={styles.descriptionBlock}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.descriptionText}>{data.description}</Text>
          </View>
        )}

        {/* ── Spacer: pushes footer to bottom ── */}
        <View style={{ flex: 1 }} />

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{data.amountFormatted || '—'}</Text>
          </View>
          <View style={styles.divider} />

          <Text style={styles.paymentTitle}>Payment Instructions</Text>
          <Text style={styles.paymentAddress}>
            Pay in USDC on Arc Testnet to: {data.paymentAddress || '—'}
          </Text>
          <Text style={styles.brandNote}>This invoice is generated by Veo.</Text>
        </View>

      </Page>
    </Document>
  )
}
