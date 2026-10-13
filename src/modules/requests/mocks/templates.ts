import type { NotificationTemplateInfo } from '@/lib/api/types'
import { addDays, businessToday, daysBetween, formatDate, formatDateTime } from '@/lib/format'
import { bookingLink, displayName, itemsOf } from '@/mocks/core/read-models'
import type { ContactRow, LeaseReturnRow, ServiceRequestRow } from '@/mocks/core/tables'
import { db } from '@/mocks/db'

/**
 * Notification template catalogue (SPEC §10) and a small renderer that mirrors the backend's
 * Jinja templates (`app/modules/h1_requests/templates`) closely enough for demo previews and
 * the mails the mock "sends". The backend renders the real thing.
 */

type Owner = NotificationTemplateInfo['owner'] | 'core'

export interface TemplateDef {
  id: string
  name: string
  owner: Owner
  subject: string
  description: string
  trigger: string
  recipients: string
  entityType: 'service_request' | 'lease_return' | null
}

const SR_TEMPLATES: TemplateDef[] = [
  [
    'sr.invitation',
    'Booking invitation',
    'Book your hardware appointment for {{ sr_number }}',
    'Order confirmation with the booking link and the next steps.',
    'SR send_invitation (daily dispatch or manual)',
    'Contact',
  ],
  [
    'sr.campus_info',
    'Campus info',
    'Your hardware order {{ sr_number }}: a technician will contact you',
    'Campus users: a technician phones them to agree a date (no booking link).',
    'SR send_campus_info (daily dispatch or manual)',
    'Contact',
  ],
  [
    'sr.reminder_1',
    'Booking reminder 1',
    'Reminder: book your appointment for {{ sr_number }}',
    'First reminder with the booking link.',
    'SR send_reminder_1',
    'Contact',
  ],
  [
    'sr.reminder_2',
    'Booking reminder 2',
    'Second reminder: appointment for {{ sr_number }} still open',
    'Second reminder with the booking link.',
    'SR send_reminder_2',
    'Contact',
  ],
  [
    'sr.escalation',
    'Booking escalation',
    'Urgent: no appointment booked for {{ sr_number }}',
    'Escalation: security and lease-cost reasons, booking link.',
    'SR escalate',
    'Contact; cc escalation mailbox',
  ],
  [
    'sr.hardware_unavailable',
    'Hardware unavailable',
    'Your order {{ sr_number }}: hardware currently unavailable',
    'Sent once when a request goes on hardware hold.',
    'SR enters hardware_unavailable (once per request)',
    'Contact',
  ],
  [
    'sr.reschedule',
    'Reschedule request',
    'Please book a new appointment for {{ sr_number }}',
    'The last appointment did not take place; booking link for a new date.',
    'SR enters reschedule_needed (not campus)',
    'Contact',
  ],
  [
    'sr.reschedule_campus',
    'Reschedule (campus)',
    'Your order {{ sr_number }}: we will contact you for a new date',
    'Campus variant: a technician phones the user for a new date.',
    'SR enters reschedule_needed (campus)',
    'Contact',
  ],
].map(([id, name, subject, description, trigger, recipients]) => ({
  id: id!,
  name: name!,
  owner: 'h1' as const,
  subject: subject!,
  description: description!,
  trigger: trigger!,
  recipients: recipients!,
  entityType: 'service_request' as const,
}))

const LEASE_BASE: [string, string, string, string, string, string][] = [
  [
    'lease.info',
    'Lease info',
    'Your leased device {{ asset_tag }} is due for return on {{ retirement_date }}',
    'Device and retirement date; please order a replacement via the ITSM portal.',
    'Lease send_info (daily dispatch or manual)',
    'Contact',
  ],
  [
    'lease.reminder_1',
    'Lease reminder 1',
    'Reminder: please order a replacement for {{ asset_tag }}',
    'Reminder with the days left until retirement.',
    'Lease send_reminder_1',
    'Contact',
  ],
  [
    'lease.reminder_2',
    'Lease reminder 2',
    'Second reminder: replacement for {{ asset_tag }} not yet ordered',
    'Stronger wording, cost impact of a late return.',
    'Lease send_reminder_2',
    'Contact',
  ],
  [
    'lease.escalation',
    'Lease escalation',
    'Action required: lease of {{ asset_tag }} ends {{ retirement_date }}',
    'Escalation notice with the list of earlier mails.',
    'Lease escalate',
    'Contact; cc escalation email (if set) and escalation mailbox',
  ],
]

const LEASE_TEMPLATES: TemplateDef[] = LEASE_BASE.flatMap(
  ([id, name, subject, description, trigger, recipients]) => [
    {
      id,
      name,
      owner: 'h1' as const,
      subject,
      description,
      trigger,
      recipients,
      entityType: 'lease_return' as const,
    },
    {
      id: `${id}_campus`,
      name: `${name} (campus)`,
      owner: 'h1' as const,
      subject,
      description: `${description} Campus variant: bring the device to the Campus service point.`,
      trigger: `${trigger}, campus users`,
      recipients,
      entityType: 'lease_return' as const,
    },
  ],
)

/** Templates of the other slices (listed like the merged backend lists them; sample preview only). */
const FOREIGN_TEMPLATES: TemplateDef[] = [
  {
    id: 'sr.shipping_confirmation',
    name: 'Shipping confirmation',
    owner: 'h3',
    subject: 'Your hardware for {{ sr_number }} is on its way',
    description:
      'Tracking links per parcel, delivery or pickup-point address, return label instructions.',
    trigger: 'ship with sendConfirmation',
    recipients: 'Contact',
    entityType: null,
  },
  {
    id: 'sr.protocol',
    name: 'Handover protocol',
    owner: 'h4',
    subject: 'Handover protocol for {{ sr_number }}',
    description: 'Summary of delivered and collected devices, deviation; protocol PDF attached.',
    trigger: 'complete_deployment with sendProtocol, or re-send',
    recipients: 'Protocol email (default contact)',
    entityType: null,
  },
  {
    id: 'tour.assigned',
    name: 'Tour assigned',
    owner: 'h4',
    subject: 'Tour {{ calendar_name }} on {{ date }} assigned to you',
    description: 'Stops with time, SR and town; link to My tour.',
    trigger: 'Tour created/assigned with technician',
    recipients: 'Technician',
    entityType: null,
  },
  {
    id: 'calloff.order',
    name: 'Call-off order',
    owner: 'h5',
    subject: 'Call-off order {{ order_number }} – {{ site_name }}',
    description: 'Order table for Initech Logistics; XLSX and PDF attached.',
    trigger: 'Call-off send',
    recipients: 'Partner orders mailbox; cc team mailbox',
    entityType: null,
  },
  {
    id: 'inventory.report',
    name: 'Inventory report',
    owner: 'h5',
    subject: 'Inventory {{ site_name }} closed',
    description: 'Summary counts and the three CSV reports.',
    trigger: 'Inventory close',
    recipients: 'Team mailbox',
    entityType: null,
  },
  {
    id: 'import.summary',
    name: 'Import summary',
    owner: 'h2',
    subject: 'Import #{{ id }} finished with errors',
    description: 'Counts and a link to the import detail; error report attached.',
    trigger: 'Import finished with errors',
    recipients: 'Uploader',
    entityType: null,
  },
]

export const TEMPLATES: readonly TemplateDef[] = [
  ...SR_TEMPLATES,
  ...LEASE_TEMPLATES,
  ...FOREIGN_TEMPLATES,
].sort((a, b) => a.id.localeCompare(b.id))

export function findTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

export function templateName(id: string): string {
  return findTemplate(id)?.name ?? id
}

// ---- contexts --------------------------------------------------------------------------------

export type MailContext = Record<string, unknown>

function salutation(contact: Pick<ContactRow, 'gender' | 'firstName' | 'lastName'> | undefined) {
  if (!contact) return 'Dear colleague'
  if (contact.gender === 'female') return `Dear Ms ${contact.lastName}`
  if (contact.gender === 'male') return `Dear Mr ${contact.lastName}`
  return `Dear ${displayName(contact)}`
}

export function srMailContext(
  sr: ServiceRequestRow,
  extra: { deviationLabel?: string | null; appointmentStart?: string | null } = {},
): MailContext {
  const contact = db.collection('contacts').get(sr.contactId)
  const items = itemsOf(sr.id)
  const region = sr.regionId ? db.collection('regions').get(sr.regionId) : undefined
  const deviation = sr.deviationCodeId
    ? db.collection('deviation_codes').get(sr.deviationCodeId)
    : undefined
  return {
    sr_number: sr.number,
    greeting: salutation(contact),
    items: items
      .filter((i) => i.slot.startsWith('new_'))
      .map((i) => i.requestedType ?? '')
      .filter(Boolean),
    old_items: items
      .filter((i) => i.slot.startsWith('old_'))
      .map((i) => i.expectedAssetTag ?? '')
      .filter(Boolean),
    booking_link: bookingLink(sr),
    region_name: region?.name ?? null,
    appointment_start: extra.appointmentStart ?? sr.appointmentStartAt,
    deviation_label: extra.deviationLabel ?? deviation?.label ?? null,
    invited_on: sr.communicationDate,
  }
}

export function leaseMailContext(lease: LeaseReturnRow): MailContext {
  const contact = lease.contactId ? db.collection('contacts').get(lease.contactId) : undefined
  const prior = (
    [
      ['Info mail', lease.infoSentAt],
      ['Reminder 1', lease.reminder1SentAt],
      ['Reminder 2', lease.reminder2SentAt],
    ] as const
  )
    .filter(([, at]) => at)
    .map(([label, at]) => ({ label, date: at }))
  return {
    asset_tag: lease.assetTag,
    model: lease.model ?? lease.modelCategory ?? 'leased device',
    retirement_date: lease.retirementDate,
    days_left: daysBetween(businessToday(), lease.retirementDate),
    greeting: salutation(contact),
    prior_mails: prior,
  }
}

export function sampleContext(template: TemplateDef): MailContext {
  const today = businessToday()
  if (template.entityType === 'lease_return' || template.id.startsWith('lease.')) {
    return {
      asset_tag: 'GX104211',
      model: 'Aero 14 G2 Laptop',
      retirement_date: addDays(today, 30),
      days_left: 30,
      greeting: 'Dear Mr Brooks',
      prior_mails: [
        { label: 'Info mail', date: addDays(today, -21) },
        { label: 'Reminder 1', date: addDays(today, -14) },
        { label: 'Reminder 2', date: addDays(today, -7) },
      ],
    }
  }
  return {
    sr_number: 'SR0012345',
    greeting: 'Dear Ms Turner',
    items: ['Laptop Standard 14', 'Docking Station USB-C', 'Monitor 27'],
    old_items: ['GX104211'],
    booking_link: 'https://booking.example.com/book/dest-westbay/svc-hw-rollout?ref=SR0012345',
    region_name: 'Westbay',
    appointment_start: `${addDays(today, 1)}T07:00:00Z`,
    deviation_label: 'User not present at the agreed time',
    invited_on: addDays(today, -7),
    calendar_name: 'Riverton route',
    date: formatDate(today),
    order_number: 'CO-RIV-0042',
    site_name: 'Riverton Hub',
    id: 7,
  }
}

// ---- rendering --------------------------------------------------------------------------------

const OPERATOR = 'Acme IT Services'
const CLIENT = 'Globex Fleet AG'
const TEAM = 'rollout-team@example.com'

function str(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter(Boolean) : []
}

function subjectOf(template: TemplateDef, ctx: MailContext): string {
  return template.subject.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = ctx[key]
    if (key === 'retirement_date' && typeof value === 'string') return formatDate(value)
    return str(value)
  })
}

function daysText(daysLeft: number): string {
  if (daysLeft > 0) return `${daysLeft} days left`
  if (daysLeft === 0) return 'ends today'
  return `${-daysLeft} days overdue`
}

function bookingParagraph(ctx: MailContext, label: string): string[] {
  const link = str(ctx.booking_link)
  return link ? [`${label}: ${link}`] : []
}

function itemsParagraph(ctx: MailContext): string {
  return list(ctx.items)
    .map((item, index) => `  ${index + 1}. ${item}`)
    .join('\n')
}

function missed(ctx: MailContext): string {
  const at = str(ctx.appointment_start)
  const deviation = str(ctx.deviation_label)
  return `your appointment${at ? ` on ${formatDateTime(at)}` : ''} for hardware order ${str(ctx.sr_number)} did not take place${deviation ? ` (${deviation.toLowerCase()})` : ''}.`
}

/** Paragraphs of the body (blank-line separated in the text version, `<p>` in HTML). */
function bodyOf(template: TemplateDef, ctx: MailContext): string[] {
  const sr = str(ctx.sr_number)
  const old = list(ctx.old_items)
  const campus = template.id.endsWith('_campus')
  const leaseId = template.id.replace('_campus', '')
  const device = `${str(ctx.model)} (asset tag ${str(ctx.asset_tag)})`
  const retirement = formatDate(str(ctx.retirement_date))
  const days = typeof ctx.days_left === 'number' ? daysText(ctx.days_left) : ''
  const portal =
    'Please order a replacement device via the ITSM portal. Once the order reaches us, we take care of the exchange and collect the old device.'
  const campusHint = campus
    ? [
        'As you work on the Campus, you can also bring the device to the Campus service point, or reply to this mail to arrange a desk visit.',
      ]
    : []
  const cost = `Devices returned after the end of the lease cause additional rental costs for ${CLIENT}, and late returns may incur penalty fees from the lessor.`
  switch (template.id) {
    case 'sr.invitation':
      return [
        `your hardware order ${sr} has arrived with us. It contains:\n${itemsParagraph(ctx)}`,
        `Please book a time for the handover. A technician brings your new devices, sets them up at your desk${old.length ? ` and takes back your old device (${old.join(', ')})` : ''}.`,
        ...bookingParagraph(ctx, 'Book your appointment'),
        `What happens next\n1. You book an appointment with the link above.\n2. We prepare and personalize your devices at our hub.\n3. Your hardware is delivered${ctx.region_name ? ` in ${str(ctx.region_name)}` : ''}.\n4. The technician hands everything over and collects your old devices.`,
      ]
    case 'sr.campus_info':
      return [
        `your hardware order ${sr} has arrived with us. It contains:\n${itemsParagraph(ctx)}`,
        'Because you work on the Campus, you do not need to book anything yourself: a technician will phone you in the next few days to agree a date for the handover at your desk.',
        'If you are away for a longer period, just reply to this mail and let us know when you are back.',
      ]
    case 'sr.reminder_1':
      return [
        `we${ctx.invited_on ? ` sent you a booking link on ${formatDate(str(ctx.invited_on))}` : ' recently sent you a booking link'} for your hardware order ${sr}, but no appointment has been booked yet.`,
        'Booking takes less than a minute. Please choose a time that suits you.',
        ...bookingParagraph(ctx, 'Book your appointment'),
      ]
    case 'sr.reminder_2':
      return [
        `the appointment for your hardware order ${sr} is still open. Your new devices are reserved for you, and we would like to hand them over soon.`,
        ...bookingParagraph(ctx, 'Please book your appointment now'),
        'If none of the offered times work for you, reply to this mail and we will find a solution together.',
      ]
    case 'sr.escalation':
      return [
        `despite several reminders, no appointment has been booked for your hardware order ${sr}.`,
        `Please book now. Your current device${old.length ? ` (${old.join(', ')})` : ''} has to be replaced for security reasons, and every week of delay causes additional lease costs for ${CLIENT}.`,
        ...bookingParagraph(ctx, 'Book your appointment now'),
        'This mail was also sent to the escalation mailbox. If there is a reason you cannot book, reply to this mail.',
      ]
    case 'sr.hardware_unavailable':
      return [
        `thank you for your hardware order ${sr}. Unfortunately, some of the ordered hardware is currently unavailable:\n${itemsParagraph(ctx)}`,
        'You do not need to do anything. As soon as the hardware is available again, we will contact you with the next steps and a link to book your appointment.',
      ]
    case 'sr.reschedule':
      return [
        missed(ctx),
        ...bookingParagraph(ctx, 'Please book a new appointment'),
        'Your devices stay reserved for you in the meantime.',
      ]
    case 'sr.reschedule_campus':
      return [
        missed(ctx),
        'A technician will phone you in the next few days to agree a new date at your Campus desk. Your devices stay reserved for you in the meantime.',
      ]
  }
  switch (leaseId) {
    case 'lease.info':
      return [
        `the lease of your device ${device} ends on ${retirement}. The device has to be returned by then.`,
        portal,
        ...campusHint,
        'What happens next\n1. You order the replacement in the ITSM portal.\n2. We send you a link to book the handover.\n3. A technician brings the new device and takes back the old one.',
      ]
    case 'lease.reminder_1':
      return [
        `this is a reminder that the lease of your device ${device} ends on ${retirement} (${days}). We have not received a replacement order yet.`,
        portal,
        ...campusHint,
      ]
    case 'lease.reminder_2':
      return [
        `the replacement for your device ${device} has still not been ordered. The lease ends on ${retirement} (${days}).`,
        cost,
        'Please order the replacement in the ITSM portal today.',
        ...campusHint,
      ]
    case 'lease.escalation': {
      const prior = Array.isArray(ctx.prior_mails)
        ? (ctx.prior_mails as { label: string; date: string }[])
        : []
      return [
        `Action required: the lease of your device ${device} ends on ${retirement} (${days}) and no replacement has been ordered.`,
        ...(prior.length
          ? [
              `We contacted you on these dates:\n${prior.map((m) => `- ${m.label}: ${formatDate(m.date)}`).join('\n')}`,
            ]
          : []),
        `${cost} This mail was also sent to the escalation contacts.`,
        'Please order the replacement in the ITSM portal now or reply to this mail if the device is no longer in use.',
        ...campusHint,
      ]
    }
  }
  return [
    `${template.description}`,
    'This template is owned by another module; the demo shows a sample.',
  ]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlParagraph(paragraph: string): string {
  const linkMatch = /^(.+?): (https:\/\/\S+)$/.exec(paragraph)
  if (linkMatch) {
    const [, label, url] = linkMatch
    return `<p style="margin:24px 0;"><a href="${escapeHtml(url ?? '')}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:bold;">${escapeHtml(label ?? '')}</a></p>`
  }
  return `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
}

/** Wrap paragraphs in the core base layout (operator header, footer, demo note). */
export function wrapHtml(subject: string, paragraphs: readonly string[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;">
<tr><td style="background:#1f3a5f;color:#ffffff;padding:18px 28px;"><div style="font-size:18px;font-weight:bold;">${OPERATOR}</div><div style="font-size:13px;opacity:0.85;">On behalf of ${CLIENT}</div></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55;">${paragraphs.map(htmlParagraph).join('\n')}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e4e7eb;font-size:12px;color:#616e7c;line-height:1.5;">Questions? Reply to this mail or write to <a href="mailto:${TEAM}" style="color:#1f3a5f;">${TEAM}</a>.<br>${OPERATOR} · Hardware rollout for ${CLIENT}<br><strong>This is a demo system.</strong> All names and addresses are fictional.</td></tr>
</table></td></tr></table></body></html>`
}

export interface RenderedMail {
  subject: string
  html: string
  text: string
}

export function renderMail(templateId: string, ctx: MailContext): RenderedMail {
  const template = findTemplate(templateId) ?? { ...FOREIGN_TEMPLATES[0]!, id: templateId }
  const subject = subjectOf(template, ctx)
  const paragraphs = [
    `${str(ctx.greeting) || 'Hello'},`,
    ...bodyOf(template, ctx),
    `Kind regards\nYour rollout team · ${OPERATOR}`,
  ]
  const text = `${OPERATOR} — on behalf of ${CLIENT}\n${'='.repeat(60)}\n\n${paragraphs.join('\n\n')}\n\n${'-'.repeat(60)}\nQuestions? Reply to this mail or write to ${TEAM}.\nThis is a demo system. All names and addresses are fictional.\n`
  return { subject, html: wrapHtml(subject, paragraphs), text }
}

/** Mail-log rows without stored HTML (seed.json keeps HTML for the newest mails only). */
export function htmlFromText(subject: string | null, text: string): string {
  const body = text.split(/\n={10,}\n/)[1] ?? text
  const main = body.split(/\n-{10,}\n/)[0] ?? body
  return wrapHtml(subject ?? '', main.trim().split(/\n\n+/))
}
